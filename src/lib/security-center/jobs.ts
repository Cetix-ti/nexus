// ============================================================================
// SECURITY CENTER — jobs d'ingestion
//
//   - syncBitdefender()         pull JSON-RPC (défaut 10 min)
//   - syncWazuhEmails()         polling récurrent des securityFolders
//                               (défaut 2 min) — passe chaque message dans
//                               AD puis Wazuh (fallback)
//   - syncSecurityHistorical()  backfill manuel déclenché depuis Paramètres
//                               > Synchronisation des alertes > Sécurité,
//                               accepte sinceDays et folders explicites.
//
// Toutes les fonctions sont résilientes (ne throw jamais) pour que le
// scheduler background ne soit pas interrompu par une erreur de parsing.
// ============================================================================

import prisma from "@/lib/prisma";
import { normalizeEmailBodyToHtml, htmlToPlainText } from "@/lib/email-to-ticket/html";
import { graphFetch, resolveFolderId } from "@/lib/email-to-ticket/service";
import { getMonitoringConfig } from "@/lib/monitoring/email-sync";
import { decodeBitdefenderEvent, type BitdefenderEvent } from "./decoders/bitdefender";
import { decodeWazuhEmail } from "./decoders/wazuh";
import { isAdSecuritySubject, decodeAdEmail } from "./decoders/ad";
import { ingestSecurityAlert } from "./correlator";
import {
  getBitdefenderConfig,
  fetchBitdefenderEvents,
  saveBitdefenderLastSync,
} from "./bitdefender-client";

// ----------------------------------------------------------------------------
// Bitdefender
// ----------------------------------------------------------------------------
export async function syncBitdefender(): Promise<{ fetched: number; ingested: number }> {
  const cfg = await getBitdefenderConfig();
  if (!cfg) return { fetched: 0, ingested: 0 };

  const events = await fetchBitdefenderEvents(cfg, cfg.lastSyncAt);
  let ingested = 0;
  for (const raw of events) {
    const decoded = await decodeBitdefenderEvent(raw as BitdefenderEvent);
    if (!decoded) continue;
    const res = await ingestSecurityAlert(decoded);
    if (res?.isNew) ingested++;
  }
  await saveBitdefenderLastSync(new Date().toISOString());
  if (events.length > 0) {
    console.log(`[security/bitdefender] ${events.length} events, ${ingested} nouvelles`);
  }
  return { fetched: events.length, ingested };
}

// ----------------------------------------------------------------------------
// Email sync — pipeline générique par dossier
// ----------------------------------------------------------------------------

type GraphSecurityMsg = {
  id: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  internetMessageId?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
};

export interface SecuritySyncStats {
  fetched: number;
  ingested: number;
  skipped: number;
  errors: string[];
}

/**
 * Scanne un dossier. Chaque message est tenté d'abord via le décodeur AD
 * (si le sujet matche un pattern AD), puis via le décodeur Wazuh en
 * fallback. Les messages dont aucun décodeur ne tire d'info sont skippés.
 *
 * @param sinceDays  si défini, filtre Graph côté serveur sur les N derniers
 *                   jours — utile pour le backfill historique.
 */
async function syncFolder(
  mailbox: string,
  folderPath: string,
  sinceDays?: number,
): Promise<SecuritySyncStats> {
  const stats: SecuritySyncStats = { fetched: 0, ingested: 0, skipped: 0, errors: [] };

  let folderId: string | null = null;
  try {
    folderId = await resolveFolderId(mailbox, folderPath);
  } catch (e) {
    stats.errors.push(`${folderPath} introuvable : ${e instanceof Error ? e.message : String(e)}`);
    return stats;
  }
  if (!folderId) return stats;

  const select = "id,subject,from,internetMessageId,receivedDateTime,isRead,bodyPreview,body";
  let nextLink: string | null =
    `/users/${encodeURIComponent(mailbox)}/mailFolders/${folderId}/messages?$top=250&$orderby=receivedDateTime desc&$select=${select}`;
  if (sinceDays && sinceDays > 0) {
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
    nextLink += `&$filter=receivedDateTime ge ${since}`;
  }

  // Paginer jusqu'à 20 pages (5000 messages) pour un backfill raisonnable.
  let iter = 0;
  while (nextLink && iter < 20) {
    iter++;
    let page: { value: GraphSecurityMsg[]; "@odata.nextLink"?: string };
    try {
      page = await graphFetch<typeof page>(nextLink);
    } catch (e) {
      stats.errors.push(`Graph fetch échoué : ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
    const messages = page.value ?? [];
    stats.fetched += messages.length;

    for (const msg of messages) {
      try {
        const messageId = msg.internetMessageId || `graph-${msg.id}`;
        const html = normalizeEmailBodyToHtml(
          msg.body?.contentType,
          msg.body?.content,
          msg.bodyPreview,
        );
        const plain = htmlToPlainText(html);
        const subject = msg.subject ?? "";
        const fromEmail = msg.from?.emailAddress?.address ?? "";
        const receivedAt = msg.receivedDateTime ? new Date(msg.receivedDateTime) : undefined;

        let decoded = null;
        // 1. AD — si le sujet matche, prioritaire.
        if (isAdSecuritySubject(subject)) {
          const already = await prisma.securityAlert.findUnique({
            where: { source_externalId: { source: "ad_email", externalId: messageId } },
          });
          if (already) {
            stats.skipped++;
            continue;
          }
          decoded = await decodeAdEmail({ subject, bodyPlain: plain, fromEmail, messageId, receivedAt });
        }
        // 2. Wazuh fallback.
        if (!decoded) {
          const already = await prisma.securityAlert.findUnique({
            where: { source_externalId: { source: "wazuh_email", externalId: messageId } },
          });
          if (already) {
            stats.skipped++;
            continue;
          }
          decoded = await decodeWazuhEmail({ subject, bodyPlain: plain, fromEmail, messageId, receivedAt });
        }
        if (!decoded) {
          stats.skipped++;
          continue;
        }
        const res = await ingestSecurityAlert(decoded);
        if (res?.isNew) stats.ingested++;
      } catch (e) {
        stats.errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    const raw: string | undefined = page["@odata.nextLink"];
    nextLink = raw ? raw.replace("https://graph.microsoft.com/v1.0", "") : null;
  }
  return stats;
}

/**
 * Job récurrent — scanne tous les `securityFolders` configurés.
 */
export async function syncWazuhEmails(): Promise<SecuritySyncStats> {
  const agg: SecuritySyncStats = { fetched: 0, ingested: 0, skipped: 0, errors: [] };
  try {
    const cfg = await getMonitoringConfig();
    if (!cfg?.mailbox) return agg;
    // Rétrocompat : si aucun securityFolder n'est défini, on scanne quand
    // même Inbox/WAZUH comme avant pour ne pas casser les installs existantes.
    const folders = cfg.securityFolders && cfg.securityFolders.length > 0
      ? cfg.securityFolders
      : ["Inbox/WAZUH"];
    for (const folder of folders) {
      const res = await syncFolder(cfg.mailbox, folder);
      agg.fetched += res.fetched;
      agg.ingested += res.ingested;
      agg.skipped += res.skipped;
      agg.errors.push(...res.errors);
    }
    if (agg.ingested > 0) {
      console.log(
        `[security/email] ${agg.fetched} msg, ${agg.ingested} nouvelles, ${agg.skipped} skip, ${agg.errors.length} erreur(s)`,
      );
    }
  } catch (err) {
    console.error("[security/email] sync failed:", err);
    agg.errors.push(err instanceof Error ? err.message : String(err));
  }
  return agg;
}

/**
 * Backfill manuel depuis Paramètres > Synchronisation des alertes.
 * `sinceDays=0` ou absent = tout l'historique disponible via Graph (Graph
 * retourne au max ~2 ans selon la politique de rétention).
 */
export async function syncSecurityHistorical(options?: {
  sinceDays?: number;
  folders?: string[];
}): Promise<SecuritySyncStats> {
  const agg: SecuritySyncStats = { fetched: 0, ingested: 0, skipped: 0, errors: [] };
  const cfg = await getMonitoringConfig();
  if (!cfg?.mailbox) {
    agg.errors.push("Boîte aux lettres de monitoring non configurée");
    return agg;
  }
  const folders = options?.folders && options.folders.length > 0
    ? options.folders
    : cfg.securityFolders && cfg.securityFolders.length > 0
      ? cfg.securityFolders
      : ["Inbox/WAZUH"];

  for (const folder of folders) {
    const res = await syncFolder(cfg.mailbox, folder, options?.sinceDays);
    agg.fetched += res.fetched;
    agg.ingested += res.ingested;
    agg.skipped += res.skipped;
    agg.errors.push(...res.errors);
  }
  return agg;
}
