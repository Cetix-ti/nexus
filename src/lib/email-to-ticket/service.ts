// ============================================================================
// EMAIL-TO-TICKET — Microsoft Graph email reader
// Reads a shared mailbox (e.g. billets@cetix.ca), parses incoming emails,
// matches sender to org/contact, and creates tickets automatically.
// Reuses the same Azure app registration as the Veeam module.
//
// Nouveautés (Freshservice-style) :
//  - Préservation HTML complète du courriel (signatures, tableaux, fils Outlook)
//  - Détection du demandeur original sur un transfert
//  - Threading entrant : un "Re: [TK-1042]" ou un In-Reply-To connu
//    devient un Comment sur le ticket existant au lieu d'un nouveau ticket
// ============================================================================

import prisma from "@/lib/prisma";
import { normalizeEmailBodyToHtml, htmlToPlainText } from "@/lib/email-to-ticket/html";
import {
  parseForwardedSender,
  extractTicketNumberFromSubject,
  parseInReplyTo,
  parseReferences,
} from "@/lib/email-to-ticket/parse";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailToTicketConfig {
  mailbox: string;       // e.g. "billets@cetix.ca"
  folderPath: string;    // e.g. "Inbox" or "Boîte de réception"
  defaultPriority: string; // MEDIUM, HIGH, etc.
  markAsRead: boolean;
}

interface GraphMessage {
  id: string;
  internetMessageId: string;
  subject: string;
  from: { emailAddress: { address: string; name: string } };
  receivedDateTime: string;
  bodyPreview: string;
  body: { content: string; contentType: string };
  isRead: boolean;
  hasAttachments: boolean;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
}

interface GraphFolder {
  id: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

const CONFIG_KEY = "email-to-ticket";

export async function getConfig(): Promise<EmailToTicketConfig | null> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return null;
  return row.value as unknown as EmailToTicketConfig;
}

export async function setConfig(config: EmailToTicketConfig) {
  await prisma.tenantSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: config as any },
    update: { value: config as any },
  });
}

// ---------------------------------------------------------------------------
// OAuth2 token (shared with Veeam module — same app registration)
// ---------------------------------------------------------------------------

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Variables AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET requises");
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  if (!res.ok) throw new Error(`OAuth2 error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

async function graphFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith("http")
    ? path
    : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Folder resolution (same logic as Veeam module)
// ---------------------------------------------------------------------------

const WELL_KNOWN: Record<string, string> = {
  inbox: "Inbox",
  "boîte de réception": "Inbox",
};

async function resolveFolderId(mailbox: string, folderPath: string): Promise<string> {
  const parts = folderPath.split("/").filter(Boolean);
  const base = `/users/${encodeURIComponent(mailbox)}`;

  if (parts.length === 0) {
    const inbox = await graphFetch<GraphFolder>(`${base}/mailFolders/Inbox`);
    return inbox.id;
  }

  let parentId: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      const wk = WELL_KNOWN[part.toLowerCase()];
      if (wk) {
        try {
          const f = await graphFetch<GraphFolder>(`${base}/mailFolders/${wk}`);
          parentId = f.id;
          continue;
        } catch { /* fall through */ }
      }
    }
    const folderUrl: string = parentId
      ? `${base}/mailFolders/${parentId}/childFolders`
      : `${base}/mailFolders`;
    const folderRes = await graphFetch<{ value: GraphFolder[] }>(folderUrl);
    const found = folderRes.value.find(
      (f: GraphFolder) => f.displayName.toLowerCase() === part.toLowerCase(),
    );
    if (!found) {
      throw new Error(
        `Dossier "${part}" introuvable. Disponibles : ${folderRes.value.map((f: GraphFolder) => f.displayName).join(", ")}`,
      );
    }
    parentId = found.id;
  }
  return parentId!;
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export async function testConnection(mailbox: string): Promise<{
  ok: boolean;
  error?: string;
  folders?: string[];
}> {
  try {
    await getAccessToken();
    const res = await graphFetch<{ value: GraphFolder[] }>(
      `/users/${encodeURIComponent(mailbox)}/mailFolders?$top=50`,
    );
    const folders: string[] = [];
    for (const f of res.value) {
      folders.push(f.displayName);
      if ((f as any).childFolderCount > 0) {
        try {
          const children = await graphFetch<{ value: GraphFolder[] }>(
            `/users/${encodeURIComponent(mailbox)}/mailFolders/${f.id}/childFolders?$top=50`,
          );
          for (const c of children.value) folders.push(`${f.displayName}/${c.displayName}`);
        } catch { /* ignore */ }
      }
    }
    return { ok: true, folders };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Domain → Organization matching
// ---------------------------------------------------------------------------

async function buildDomainMap(): Promise<Map<string, { id: string; name: string }>> {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, domain: true, domains: true },
  });
  const map = new Map<string, { id: string; name: string }>();
  for (const org of orgs) {
    if (org.domain) map.set(org.domain.toLowerCase(), { id: org.id, name: org.name });
    for (const d of org.domains ?? []) {
      if (d) map.set(d.toLowerCase(), { id: org.id, name: org.name });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Find or create contact from email sender
// ---------------------------------------------------------------------------

async function resolveContact(
  senderEmail: string,
  senderName: string,
  orgId: string,
): Promise<string | null> {
  // Try to find existing contact
  const existing = await prisma.contact.findFirst({
    where: {
      organizationId: orgId,
      email: { equals: senderEmail, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Auto-create contact
  const parts = senderName.split(" ");
  const firstName = parts[0] || senderEmail.split("@")[0];
  const lastName = parts.slice(1).join(" ") || "";

  const contact = await prisma.contact.create({
    data: {
      organizationId: orgId,
      firstName,
      lastName,
      email: senderEmail.toLowerCase(),
      isActive: true,
    },
  });
  return contact.id;
}

// ---------------------------------------------------------------------------
// Sync: read emails → create tickets (ou append un reply sur un ticket existant)
// ---------------------------------------------------------------------------

/**
 * Essaye de raccrocher un courriel entrant à un ticket existant.
 * Stratégies, dans l'ordre :
 *  1. In-Reply-To / References ciblent un Comment.messageId connu
 *  2. Subject contient "[TK-1042]" / "[INT-1042]" → lookup par number
 *  3. In-Reply-To / References ciblent un Ticket.externalId connu
 * Retourne l'id du ticket ciblé ou null.
 */
async function findThreadedTicket(
  subject: string,
  headers: Array<{ name: string; value: string }> | undefined,
): Promise<string | null> {
  const inReplyTo = parseInReplyTo(headers);
  const refs = parseReferences(headers);
  const candidateIds = [inReplyTo, ...refs].filter(Boolean) as string[];

  if (candidateIds.length > 0) {
    // 1. Match par Comment.messageId (réponse à notre sortant)
    const comment = await prisma.comment.findFirst({
      where: { messageId: { in: candidateIds } },
      select: { ticketId: true },
    });
    if (comment) return comment.ticketId;

    // 3. Match par Ticket.externalId (réponse au message qui a créé le ticket)
    const ticket = await prisma.ticket.findFirst({
      where: { externalId: { in: candidateIds } },
      select: { id: true },
    });
    if (ticket) return ticket.id;
  }

  // 2. Match par "[TK-1042]" dans le sujet
  const parsed = extractTicketNumberFromSubject(subject);
  if (parsed) {
    const ticket = await prisma.ticket.findFirst({
      where: { number: parsed.rawNumber },
      select: { id: true },
    });
    if (ticket) return ticket.id;
  }

  return null;
}

export async function syncEmailsToTickets(config?: EmailToTicketConfig | null): Promise<{
  fetched: number;
  created: number;
  skipped: number;
  errors: string[];
}> {
  const cfg = config ?? (await getConfig());
  if (!cfg) {
    return { fetched: 0, created: 0, skipped: 0, errors: ["Configuration non définie"] };
  }

  const errors: string[] = [];
  let fetched = 0;
  let created = 0;
  let skipped = 0;

  try {
    const folderId = await resolveFolderId(cfg.mailbox, cfg.folderPath);
    const domainMap = await buildDomainMap();

    // Get the most recent ticket created from email to avoid re-processing
    const lastTicket = await prisma.ticket.findFirst({
      where: { source: "EMAIL" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const since = lastTicket
      ? new Date(lastTicket.createdAt.getTime() - 60 * 60 * 1000) // 1h overlap
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // first run: 7 days

    // Fetch unread messages (or all recent if markAsRead is false)
    const filterParts = [`receivedDateTime ge ${since.toISOString()}`];
    if (cfg.markAsRead) {
      filterParts.push("isRead eq false");
    }

    let nextLink: string | null =
      `/users/${encodeURIComponent(cfg.mailbox)}/mailFolders/${folderId}/messages` +
      `?$filter=${filterParts.join(" and ")}` +
      `&$orderby=receivedDateTime asc` +
      `&$top=50` +
      `&$select=id,internetMessageId,subject,from,receivedDateTime,bodyPreview,body,isRead,hasAttachments,internetMessageHeaders`;

    interface GraphPage { value: GraphMessage[]; "@odata.nextLink"?: string; }

    while (nextLink) {
      const page: GraphPage = await graphFetch<GraphPage>(nextLink);

      for (const msg of page.value) {
        fetched++;
        try {
          const senderEmail = msg.from?.emailAddress?.address?.toLowerCase();
          if (!senderEmail) { skipped++; continue; }
          const senderName = msg.from?.emailAddress?.name || senderEmail;
          const rawSubject = (msg.subject || "").trim();
          if (!rawSubject) { skipped++; continue; }
          // Version "propre" du sujet pour ticket.subject : on vire les
          // préfixes Re:/Fw: et le tag [TK-1042] pour éviter la pollution.
          const cleanSubject = rawSubject
            .replace(/^\s*(?:re|rv|fw|fwd|tr|transfert|transféré|wg)\s*:\s*/gi, "")
            .replace(/\s*\[(?:TK|INT|INC)[\s-]*\d{3,}\]\s*/gi, " ")
            .replace(/\s+/g, " ")
            .trim() || rawSubject;

          const messageId = msg.internetMessageId || `graph-${msg.id}`;

          // Dédup strict : même Message-ID déjà vu (en tant que ticket
          // source OU comment sortant → comment entrant).
          const alreadySeen = await prisma.ticket.findFirst({
            where: { externalId: messageId },
            select: { id: true },
          });
          if (alreadySeen) { skipped++; continue; }
          const dupComment = await prisma.comment.findFirst({
            where: { messageId },
            select: { id: true },
          });
          if (dupComment) { skipped++; continue; }

          // --- Normalisation du body (HTML préservé) -----------------------
          // On stocke TOUJOURS un HTML safe dans descriptionHtml/bodyHtml.
          // Le plain text de fallback est extrait depuis le HTML (pas
          // l'inverse) pour préserver au mieux la structure.
          const htmlBody = normalizeEmailBodyToHtml(
            msg.body?.contentType,
            msg.body?.content,
            msg.bodyPreview,
          );
          const plainBody = htmlToPlainText(htmlBody);
          // Texte utilisé pour la détection forward (plus robuste que HTML).
          const forwardText = msg.body?.contentType === "html"
            ? msg.body.content
            : (msg.body?.content || msg.bodyPreview || "");

          // --- Threading : est-ce une réponse à un ticket existant ? -------
          const targetTicketId = await findThreadedTicket(
            rawSubject,
            msg.internetMessageHeaders,
          );

          if (targetTicketId) {
            // Réponse entrante : on l'ajoute comme Comment PUBLIC au ticket.
            // Requester par défaut : le sender du courriel (c'est normal pour
            // une réponse — le client répond depuis son propre compte).
            // On réutilise le contact/demandeur existant du ticket comme
            // author si on le retrouve, sinon on retombe sur n'importe quel
            // agent actif (les Comments demandent un authorId User valide).
            const ticket = await prisma.ticket.findUnique({
              where: { id: targetTicketId },
              select: { organizationId: true, requesterId: true },
            });
            if (!ticket) { skipped++; continue; }

            // On a besoin d'un User pour authorId — on prend l'agent "bot"
            // (premier admin actif). Le vrai auteur est tracé dans le body
            // (le HTML contient "De : ..." de toute façon) + on pourra plus
            // tard ajouter un champ `authorContactId` si on veut afficher
            // proprement "Répondu par <client>" au portail.
            const agent = await prisma.user.findFirst({
              where: { role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "TECHNICIAN"] }, isActive: true },
              select: { id: true },
              orderBy: { role: "asc" },
            });
            if (!agent) {
              errors.push(`Aucun agent pour loger le reply de ${senderEmail}`);
              continue;
            }

            await prisma.comment.create({
              data: {
                ticketId: targetTicketId,
                authorId: agent.id, // fallback ; cf. commentaire ci-dessus
                body: plainBody.slice(0, 50_000) ||
                  `(Réponse de ${senderName} <${senderEmail}>)`,
                bodyHtml: htmlBody.slice(0, 500_000),
                isInternal: false,
                messageId,
                inReplyToMessageId: parseInReplyTo(msg.internetMessageHeaders),
                source: "email",
              },
            });

            // Remet le ticket en OPEN s'il était RESOLVED/CLOSED — le
            // client vient de répondre, donc la conversation reprend.
            await prisma.ticket.updateMany({
              where: {
                id: targetTicketId,
                status: { in: ["RESOLVED", "CLOSED"] },
              },
              data: { status: "OPEN", resolvedAt: null, closedAt: null },
            });

            created++; // on comptabilise ça comme "1 contenu créé" côté sync
            if (cfg.markAsRead && !msg.isRead) {
              await markAsRead(cfg.mailbox, msg.id).catch(() => {});
            }
            continue;
          }

          // --- Nouveau ticket : détection forward pour le demandeur --------
          const forward = parseForwardedSender(rawSubject, forwardText, {
            email: senderEmail,
            name: senderName,
          });
          const actualEmail = forward.originalSenderEmail ?? senderEmail;
          const actualName = forward.originalSenderName ?? senderName;

          // Match org par domaine : priorité au sender original.
          const domain = actualEmail.split("@")[1] || "";
          let org = domainMap.get(domain);
          if (!org && forward.isForward) {
            const forwarderDomain = senderEmail.split("@")[1] || "";
            org = domainMap.get(forwarderDomain);
          }
          if (!org) {
            skipped++;
            continue;
          }

          const contactId = await resolveContact(actualEmail, actualName, org.id);
          const creator = await prisma.user.findFirst({
            where: { role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "TECHNICIAN"] }, isActive: true },
            select: { id: true },
            orderBy: { role: "asc" },
          });
          if (!creator) {
            errors.push(`Aucun agent pour créer le ticket de ${senderEmail}`);
            continue;
          }

          // Clé: on stocke l'HTML SANITIZÉ dans descriptionHtml (le full
          // fil Outlook est conservé), et un plain extrait pour la recherche
          // et le fallback.
          await prisma.ticket.create({
            data: {
              organizationId: org.id,
              requesterId: contactId,
              creatorId: creator.id,
              subject: cleanSubject.slice(0, 255),
              description: plainBody.slice(0, 10_000) || cleanSubject,
              descriptionHtml: htmlBody.slice(0, 500_000) || null,
              status: "NEW",
              priority: (cfg.defaultPriority as never) || "MEDIUM",
              type: "INCIDENT",
              source: "EMAIL",
              externalSource: "email",
              externalId: messageId,
            },
          });
          created++;

          if (cfg.markAsRead && !msg.isRead) {
            await markAsRead(cfg.mailbox, msg.id).catch(() => {});
          }
        } catch (err) {
          errors.push(`Message ${msg.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const raw: string | undefined = page["@odata.nextLink"];
      nextLink = raw ? raw.replace("https://graph.microsoft.com/v1.0", "") : null;
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { fetched, created, skipped, errors };
}

async function markAsRead(mailbox: string, messageId: string): Promise<void> {
  await graphFetch(
    `/users/${encodeURIComponent(mailbox)}/messages/${messageId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    },
  );
}
