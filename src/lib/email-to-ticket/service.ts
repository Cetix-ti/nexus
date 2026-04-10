// ============================================================================
// EMAIL-TO-TICKET — Microsoft Graph email reader
// Reads a shared mailbox (e.g. billets@cetix.ca), parses incoming emails,
// matches sender to org/contact, and creates tickets automatically.
// Reuses the same Azure app registration as the Veeam module.
// ============================================================================

import prisma from "@/lib/prisma";

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
// Strip HTML from email body
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Sync: read emails → create tickets
// ---------------------------------------------------------------------------

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
      `&$select=id,internetMessageId,subject,from,receivedDateTime,bodyPreview,body,isRead,hasAttachments`;

    interface GraphPage { value: GraphMessage[]; "@odata.nextLink"?: string; }

    while (nextLink) {
      const page: GraphPage = await graphFetch<GraphPage>(nextLink);

      for (const msg of page.value) {
        fetched++;
        try {
          const senderEmail = msg.from?.emailAddress?.address?.toLowerCase();
          if (!senderEmail) { skipped++; continue; }
          const senderName = msg.from?.emailAddress?.name || senderEmail;
          const subject = msg.subject?.trim();
          if (!subject) { skipped++; continue; }

          // Check if ticket already exists for this email (dedup by internetMessageId)
          const messageId = msg.internetMessageId || `graph-${msg.id}`;
          const existingTicket = await prisma.ticket.findFirst({
            where: { externalId: messageId, externalSource: "email" },
            select: { id: true },
          });
          if (existingTicket) { skipped++; continue; }

          // Match sender domain to org
          const domain = senderEmail.split("@")[1] || "";
          const org = domainMap.get(domain);
          if (!org) {
            skipped++;
            continue; // Can't create ticket without an org
          }

          // Find or create contact
          const contactId = await resolveContact(senderEmail, senderName, org.id);

          // Extract body text
          const bodyText = msg.body?.contentType === "html"
            ? stripHtml(msg.body.content)
            : (msg.body?.content || msg.bodyPreview || "");

          // Find the first admin/tech user to use as creator
          const creator = await prisma.user.findFirst({
            where: { role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "TECHNICIAN"] }, isActive: true },
            select: { id: true },
            orderBy: { role: "asc" },
          });
          if (!creator) {
            errors.push(`Aucun agent trouvé pour créer le ticket de ${senderEmail}`);
            continue;
          }

          // Create ticket
          await prisma.ticket.create({
            data: {
              organizationId: org.id,
              requesterId: contactId,
              creatorId: creator.id,
              subject,
              description: bodyText.slice(0, 10000),
              descriptionHtml: msg.body?.contentType === "html" ? msg.body.content.slice(0, 50000) : null,
              status: "NEW",
              priority: (cfg.defaultPriority as any) || "MEDIUM",
              type: "INCIDENT",
              source: "EMAIL",
              externalSource: "email",
              externalId: messageId,
            },
          });
          created++;

          // Mark as read in Graph if configured
          if (cfg.markAsRead && !msg.isRead) {
            try {
              await graphFetch(
                `/users/${encodeURIComponent(cfg.mailbox)}/messages/${msg.id}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isRead: true }),
                },
              );
            } catch { /* ignore mark-as-read failures */ }
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
