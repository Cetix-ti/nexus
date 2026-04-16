// ============================================================================
// SECURITY CENTER — jobs d'ingestion
//
//   - syncWazuhEmails()         polling récurrent des securityFolders
//                               (défaut 2 min) — passe chaque message dans
//                               AD puis Wazuh (fallback)
//   - syncWazuhApi()            pull JSON direct depuis l'Indexer (2 min)
//   - syncSecurityHistorical()  backfill manuel déclenché depuis Paramètres
//                               > Synchronisation des alertes > Sécurité,
//                               accepte sinceDays et folders explicites.
//
// Note : Bitdefender GravityZone fonctionne exclusivement en PUSH. Voir
// /api/v1/integrations/bitdefender/webhook — pas de job pull ici.
//
// Toutes les fonctions sont résilientes (ne throw jamais) pour que le
// scheduler background ne soit pas interrompu par une erreur de parsing.
// ============================================================================

import prisma from "@/lib/prisma";
import { normalizeEmailBodyToHtml, htmlToPlainText } from "@/lib/email-to-ticket/html";
import { graphFetch, resolveFolderId } from "@/lib/email-to-ticket/service";
import { getMonitoringConfig } from "@/lib/monitoring/email-sync";
import { decodeWazuhEmail } from "./decoders/wazuh";
import { decodeWazuhApiAlert } from "./decoders/wazuh-api";
import { isAdSecuritySubject, decodeAdEmail } from "./decoders/ad";
import { ingestSecurityAlert } from "./correlator";
import { getWazuhConfig, saveWazuhConfig, fetchWazuhAlerts } from "./wazuh-client";

// ----------------------------------------------------------------------------
// Wazuh Indexer — pull JSON direct depuis l'API (recommandé vs email)
// ----------------------------------------------------------------------------

export async function syncWazuhApi(options?: { sinceDays?: number }): Promise<{
  fetched: number;
  ingested: number;
  skipped: number;
  errors: string[];
}> {
  const stats = { fetched: 0, ingested: 0, skipped: 0, errors: [] as string[] };
  const cfg = await getWazuhConfig();
  if (!cfg.enabled || !cfg.apiUrl) return stats;

  // Curseur : soit on demande les alertes depuis `sinceDays` (backfill
  // manuel déclenché depuis les paramètres), soit on repart du dernier
  // timestamp connu (poll récurrent).
  const since =
    options?.sinceDays && options.sinceDays > 0
      ? new Date(Date.now() - options.sinceDays * 86_400_000).toISOString()
      : cfg.lastSyncAt;

  try {
    // Pagination manuelle par cursor timestamp. Un simple `search_after`
    // OpenSearch serait plus élégant mais une boucle avec avancement du
    // cursor suffit pour ingérer N pages d'au plus 500 alertes.
    let cursor = since;
    let maxTimestampSeen: string | null = null;
    for (let page = 0; page < 20; page++) {
      const { alerts } = await fetchWazuhAlerts(cfg, { since: cursor, size: 500 });
      if (alerts.length === 0) break;
      stats.fetched += alerts.length;
      for (const hit of alerts) {
        try {
          const decoded = await decodeWazuhApiAlert(hit);
          if (!decoded) {
            stats.skipped++;
            continue;
          }
          const res = await ingestSecurityAlert(decoded);
          if (res?.isNew) stats.ingested++;
          else stats.skipped++;
          const ts = hit._source.timestamp;
          if (ts && (!maxTimestampSeen || ts > maxTimestampSeen)) maxTimestampSeen = ts;
        } catch (e) {
          stats.errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      // Avance le cursor — si on n'a pas avancé, on brise la boucle pour
      // éviter un spin sur la même dernière alerte.
      if (maxTimestampSeen && maxTimestampSeen !== cursor) {
        cursor = maxTimestampSeen;
      } else {
        break;
      }
    }
    if (maxTimestampSeen) {
      await saveWazuhConfig({ lastSyncAt: maxTimestampSeen });
    }
    if (stats.ingested > 0) {
      console.log(
        `[security/wazuh-api] ${stats.fetched} alertes examinées, ${stats.ingested} nouvelles`,
      );
    }
  } catch (e) {
    stats.errors.push(e instanceof Error ? e.message : String(e));
    console.error("[security/wazuh-api] sync échoué :", e);
  }
  return stats;
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
