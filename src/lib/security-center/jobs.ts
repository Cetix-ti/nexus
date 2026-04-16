// ============================================================================
// BACKGROUND JOBS — ingestion récurrente pour le Centre de sécurité.
//
// Trois jobs :
//   - syncBitdefender()    toutes les 10 min  (pull JSON-RPC)
//   - syncWazuhEmails()    toutes les 2 min   (sous-dossier "WAZUH")
//   - (AD emails)          déjà traité dans email-to-ticket/service.ts
//
// Chaque job est résilient : une erreur ne doit pas stopper les autres
// background jobs du scheduler. Pattern identique à src/lib/scheduler.
// ============================================================================

import { decodeBitdefenderEvent, type BitdefenderEvent } from "./decoders/bitdefender";
import { decodeWazuhEmail } from "./decoders/wazuh";
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
  // Ancre = maintenant (le prochain pull filtrera les events > now).
  await saveBitdefenderLastSync(new Date().toISOString());
  if (events.length > 0) {
    console.log(`[security/bitdefender] ${events.length} events fetched, ${ingested} nouvelles`);
  }
  return { fetched: events.length, ingested };
}

// ----------------------------------------------------------------------------
// Wazuh subfolder reader
// ----------------------------------------------------------------------------
// Réutilise le Graph client de email-to-ticket. Lit les messages du
// sous-dossier "WAZUH" de la mailbox configurée (alertes@cetix.ca), passe
// chacun dans le décodeur Wazuh, puis marque comme lu pour ne pas les
// ré-ingérer à la prochaine passe.
import prisma from "@/lib/prisma";
import { normalizeEmailBodyToHtml, htmlToPlainText } from "@/lib/email-to-ticket/html";
import { graphFetch, resolveFolderId } from "@/lib/email-to-ticket/service";
import { getMonitoringConfig } from "@/lib/monitoring/email-sync";

export async function syncWazuhEmails(): Promise<{ fetched: number; ingested: number }> {
  try {
    // On réutilise la boîte configurée pour le monitoring (alertes@cetix.ca)
    // car c'est là que Wazuh route ses notifications.
    const cfg = await getMonitoringConfig();
    if (!cfg?.mailbox) return { fetched: 0, ingested: 0 };
    // Tolère une absence du dossier WAZUH (ex: pas encore créé par l'admin).
    let folderId: string | null = null;
    try {
      folderId = await resolveFolderId(cfg.mailbox, "Inbox/WAZUH");
    } catch {
      return { fetched: 0, ingested: 0 };
    }
    if (!folderId) return { fetched: 0, ingested: 0 };
    if (!folderId) return { fetched: 0, ingested: 0 };

    type Msg = {
      id: string;
      subject?: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      internetMessageId?: string;
      receivedDateTime?: string;
      isRead?: boolean;
      bodyPreview?: string;
      body?: { contentType?: string; content?: string };
    };
    const page = await graphFetch<{ value: Msg[] }>(
      `/users/${encodeURIComponent(cfg.mailbox)}/mailFolders/${folderId}/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,from,internetMessageId,receivedDateTime,isRead,bodyPreview,body`,
    );
    let ingested = 0;
    for (const msg of page.value ?? []) {
      const messageId = msg.internetMessageId || `graph-${msg.id}`;
      const already = await prisma.securityAlert.findUnique({
        where: { source_externalId: { source: "wazuh_email", externalId: messageId } },
      });
      if (already) continue;
      const html = normalizeEmailBodyToHtml(
        msg.body?.contentType,
        msg.body?.content,
        msg.bodyPreview,
      );
      const plain = htmlToPlainText(html);
      const decoded = await decodeWazuhEmail({
        subject: msg.subject ?? "",
        bodyPlain: plain,
        fromEmail: msg.from?.emailAddress?.address ?? "",
        messageId,
        receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : undefined,
      });
      if (!decoded) continue;
      const res = await ingestSecurityAlert(decoded);
      if (res?.isNew) ingested++;
    }
    if ((page.value ?? []).length > 0) {
      console.log(`[security/wazuh] ${page.value.length} messages fetched, ${ingested} nouvelles alertes`);
    }
    return { fetched: page.value?.length ?? 0, ingested };
  } catch (err) {
    console.error("[security/wazuh] sync failed:", err);
    return { fetched: 0, ingested: 0 };
  }
}
