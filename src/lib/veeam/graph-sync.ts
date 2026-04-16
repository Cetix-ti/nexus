// ============================================================================
// VEEAM BACKUP MONITORING — Microsoft Graph email reader
// Replaces IMAP with the Graph REST API (client credentials flow).
// ============================================================================

import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VeeamGraphConfig {
  mailbox: string;       // e.g. "alertes@cetix.ca"
  folderPath: string;    // e.g. "Inbox/Veeam" or "Veeam Alerts"
}

export type VeeamStatus = "SUCCESS" | "WARNING" | "FAILED";

interface ParsedVeeamAlert {
  jobName: string;
  status: VeeamStatus;
  senderEmail: string;
  senderName: string | null;
  senderDomain: string;
  subject: string;
  bodySnippet: string;
  messageId: string;
  receivedAt: Date;
}

interface GraphMessage {
  id: string;
  internetMessageId: string;
  subject: string;
  from: { emailAddress: { address: string; name: string } };
  receivedDateTime: string;
  bodyPreview: string;
  body: { content: string; contentType: string };
}

interface GraphFolder {
  id: string;
  displayName: string;
  childFolderCount: number;
}

// ---------------------------------------------------------------------------
// Config persistence via TenantSetting
// ---------------------------------------------------------------------------

const CONFIG_KEY = "veeam.graph";

export async function getVeeamGraphConfig(): Promise<VeeamGraphConfig | null> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return null;
  return row.value as unknown as VeeamGraphConfig;
}

export async function setVeeamGraphConfig(config: VeeamGraphConfig) {
  await prisma.tenantSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: config as any },
    update: { value: config as any },
  });
}

// ---------------------------------------------------------------------------
// OAuth2 client credentials token
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
    throw new Error(
      "Variables AZURE_TENANT_ID, AZURE_CLIENT_ID et AZURE_CLIENT_SECRET requises dans .env",
    );
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur OAuth2 (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// ---------------------------------------------------------------------------
// Graph API helpers
// ---------------------------------------------------------------------------

async function graphFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Folder resolution — supports paths like "Inbox/Veeam"
// ---------------------------------------------------------------------------

// Well-known folder aliases → Graph well-known IDs
const WELL_KNOWN_FOLDERS: Record<string, string> = {
  inbox: "Inbox",
  "boîte de réception": "Inbox",
  drafts: "Drafts",
  brouillons: "Drafts",
  "sent items": "SentItems",
  "éléments envoyés": "SentItems",
  "deleted items": "DeletedItems",
  "éléments supprimés": "DeletedItems",
  archive: "Archive",
  "junk email": "JunkEmail",
  "courrier indésirable": "JunkEmail",
};

async function resolveFolderId(
  mailbox: string,
  folderPath: string,
): Promise<string> {
  const parts = folderPath.split("/").filter(Boolean);
  const basePath = `/users/${encodeURIComponent(mailbox)}`;

  if (parts.length === 0) {
    const inbox = await graphFetch<GraphFolder>(
      `${basePath}/mailFolders/Inbox`,
    );
    return inbox.id;
  }

  // Walk the folder tree
  let parentId: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // First segment: try well-known folder name
    if (i === 0) {
      const wellKnown = WELL_KNOWN_FOLDERS[part.toLowerCase()];
      if (wellKnown) {
        try {
          const wkFolder = await graphFetch<GraphFolder>(
            `${basePath}/mailFolders/${wellKnown}`,
          );
          parentId = wkFolder.id;
          continue;
        } catch {
          // Not a well-known name, fall through to display name search
        }
      }
    }

    const folderUrl: string = parentId
      ? `${basePath}/mailFolders/${parentId}/childFolders`
      : `${basePath}/mailFolders`;

    const folderRes = await graphFetch<{ value: GraphFolder[] }>(folderUrl);
    const found = folderRes.value.find(
      (f: GraphFolder) => f.displayName.toLowerCase() === part.toLowerCase(),
    );
    if (!found) {
      throw new Error(
        `Dossier "${part}" introuvable. Dossiers disponibles : ${folderRes.value.map((f: GraphFolder) => f.displayName).join(", ")}`,
      );
    }
    parentId = found.id;
  }

  return parentId!;
}

// ---------------------------------------------------------------------------
// Test connection + list folders
// ---------------------------------------------------------------------------

export async function testGraphConnection(mailbox: string): Promise<{
  ok: boolean;
  error?: string;
  folders?: string[];
}> {
  try {
    // Test token
    await getAccessToken();

    // List top-level folders
    const res = await graphFetch<{ value: GraphFolder[] }>(
      `/users/${encodeURIComponent(mailbox)}/mailFolders?$top=50`,
    );

    const folders: string[] = [];

    for (const f of res.value) {
      folders.push(f.displayName);
      // List child folders (1 level deep)
      if (f.childFolderCount > 0) {
        try {
          const children = await graphFetch<{ value: GraphFolder[] }>(
            `/users/${encodeURIComponent(mailbox)}/mailFolders/${f.id}/childFolders?$top=50`,
          );
          for (const c of children.value) {
            folders.push(`${f.displayName}/${c.displayName}`);
          }
        } catch {
          // ignore child folder errors
        }
      }
    }

    return { ok: true, folders };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Veeam email parser
// ---------------------------------------------------------------------------

function parseVeeamStatus(subject: string, body: string): VeeamStatus {
  const text = `${subject} ${body}`.toLowerCase();
  if (
    text.includes("failed") ||
    text.includes("error") ||
    text.includes("échoué")
  )
    return "FAILED";
  if (text.includes("warning") || text.includes("avertissement"))
    return "WARNING";
  return "SUCCESS";
}

function extractJobName(subject: string): string {
  // Common Veeam subject patterns:
  // "[SUCCESS] Job Name 2026-04-09"
  // "Veeam Backup Job: Job Name - Success"
  // "[FAILED] Job Name"
  const bracketMatch = subject.match(
    /\[(?:SUCCESS|FAILED|WARNING)\]\s*(.+?)(?:\s+\d{4}-\d{2}-\d{2}.*)?$/i,
  );
  if (bracketMatch) return bracketMatch[1].trim();

  const colonMatch = subject.match(
    /(?:Veeam.*?Job|Backup.*?Job)[:\s]+(.+?)(?:\s*-\s*(?:Success|Failed|Warning))?$/i,
  );
  if (colonMatch) return colonMatch[1].trim();

  return (
    subject
      .replace(/\[(SUCCESS|FAILED|WARNING)\]/gi, "")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
      .replace(/\b(success|failed|warning|veeam|backup|job)\b/gi, "")
      .replace(/[:\-]+/g, " ")
      .trim() || subject
  );
}

function parseSenderDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function parseGraphMessage(msg: GraphMessage): ParsedVeeamAlert | null {
  const from = msg.from?.emailAddress?.address ?? "";
  if (!from) return null;

  const subject = msg.subject ?? "";
  const body = msg.bodyPreview ?? "";
  const rawName = (msg.from?.emailAddress?.name ?? "").trim();

  return {
    jobName: extractJobName(subject),
    status: parseVeeamStatus(subject, body),
    senderEmail: from.toLowerCase(),
    senderName: rawName && rawName !== from ? rawName : null,
    senderDomain: parseSenderDomain(from),
    subject,
    bodySnippet: body.slice(0, 500),
    messageId:
      msg.internetMessageId ||
      `graph-${msg.id}`,
    receivedAt: new Date(msg.receivedDateTime),
  };
}

// ---------------------------------------------------------------------------
// Domain → Organization matching
// ---------------------------------------------------------------------------

async function buildDomainMap(): Promise<
  Map<string, { id: string; name: string }>
> {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, domain: true, domains: true },
  });
  const map = new Map<string, { id: string; name: string }>();
  for (const org of orgs) {
    if (org.domain) {
      map.set(org.domain.toLowerCase(), { id: org.id, name: org.name });
    }
    for (const d of org.domains ?? []) {
      if (d) map.set(d.toLowerCase(), { id: org.id, name: org.name });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Secret expiry check
// ---------------------------------------------------------------------------

export function getSecretExpiryInfo(): {
  expiryDate: string | null;
  daysLeft: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean; // < 30 days
} {
  const expiry = process.env.AZURE_SECRET_EXPIRY;
  if (!expiry) return { expiryDate: null, daysLeft: null, isExpired: false, isExpiringSoon: false };

  const expiryDate = new Date(expiry);
  const now = new Date();
  const daysLeft = Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    expiryDate: expiry,
    daysLeft,
    isExpired: daysLeft <= 0,
    isExpiringSoon: daysLeft > 0 && daysLeft <= 30,
  };
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Collect folder + all subfolders recursively
// ---------------------------------------------------------------------------

async function collectFolderIds(
  mailbox: string,
  parentFolderId: string,
): Promise<string[]> {
  const ids = [parentFolderId];
  const basePath = `/users/${encodeURIComponent(mailbox)}`;
  try {
    const res = await graphFetch<{ value: GraphFolder[] }>(
      `${basePath}/mailFolders/${parentFolderId}/childFolders?$top=100`,
    );
    for (const child of res.value) {
      const childIds = await collectFolderIds(mailbox, child.id);
      ids.push(...childIds);
    }
  } catch {
    // No child folders or permission error — just return parent
  }
  return ids;
}

// Client-side subject filter — Graph API can't combine contains() OR with date
// filters efficiently (returns InefficientFilter error), so we filter by date
// server-side and filter subjects in code.
const BACKUP_SUBJECT_PATTERNS = [
  /\[(success|warning|failed)\]/i,
  /\bBKP\b/i,
  /\bbackup\b.*\b(success|warning|fail|error)\b/i,
  /\b(success|warning|fail|error)\b.*\bbackup\b/i,
];

function isBackupSubject(subject: string): boolean {
  return BACKUP_SUBJECT_PATTERNS.some((rx) => rx.test(subject));
}

export async function syncVeeamAlerts(
  config?: VeeamGraphConfig | null,
  options?: { sinceDays?: number },
): Promise<{
  fetched: number;
  newAlerts: number;
  errors: string[];
}> {
  const cfg = config ?? (await getVeeamGraphConfig());
  if (!cfg) {
    return {
      fetched: 0,
      newAlerts: 0,
      errors: ["Configuration Veeam non définie — allez dans Paramètres."],
    };
  }

  const errors: string[] = [];
  let fetched = 0;
  let newAlerts = 0;

  try {
    // Check secret expiry
    const expiry = getSecretExpiryInfo();
    if (expiry.isExpired) {
      return {
        fetched: 0,
        newAlerts: 0,
        errors: [
          `Le secret Azure a expiré le ${expiry.expiryDate}. Renouvelez-le dans Entra ID et mettez à jour AZURE_CLIENT_SECRET dans .env`,
        ],
      };
    }

    // Resolve the target folder + all its subfolders
    const rootFolderId = await resolveFolderId(cfg.mailbox, cfg.folderPath);
    const allFolderIds = await collectFolderIds(cfg.mailbox, rootFolderId);

    // Determine the "since" date for fetching
    // sinceDays: 0 = all history, undefined = incremental (since last sync or 30d)
    let dateFilter = "";
    const sinceDays = options?.sinceDays;
    if (sinceDays === undefined) {
      // Incremental: since last synced alert or 30 days
      const latest = await prisma.veeamBackupAlert.findFirst({
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      });
      const since = latest
        ? new Date(latest.receivedAt.getTime() - 24 * 60 * 60 * 1000)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = `receivedDateTime ge ${since.toISOString()}`;
    } else if (sinceDays > 0) {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      dateFilter = `receivedDateTime ge ${since.toISOString()}`;
    }
    // sinceDays === 0 → no filter → full history

    const domainMap = await buildDomainMap();
    const filterParam = dateFilter ? `&$filter=${dateFilter}` : "";

    // Scan each folder (root + subfolders)
    for (const folderId of allFolderIds) {
    let nextLink: string | null =
      `/users/${encodeURIComponent(cfg.mailbox)}/mailFolders/${folderId}/messages` +
      `?$orderby=receivedDateTime desc` +
      `&$top=50` +
      `&$select=id,internetMessageId,subject,from,receivedDateTime,bodyPreview` +
      filterParam;

    interface GraphPage {
      value: GraphMessage[];
      "@odata.nextLink"?: string;
    }

    while (nextLink) {
      const page: GraphPage = await graphFetch<GraphPage>(nextLink);

      for (const msg of page.value) {
        // Client-side filter: only process backup alert subjects
        if (!isBackupSubject(msg.subject ?? "")) continue;
        fetched++;
        try {
          const alert = parseGraphMessage(msg);
          if (!alert) continue;

          // Deduplicate
          const exists = await prisma.veeamBackupAlert.findUnique({
            where: { messageId: alert.messageId },
            select: { id: true },
          });
          if (exists) continue;

          // Match org by sender domain
          const org = domainMap.get(alert.senderDomain);

          await prisma.veeamBackupAlert.create({
            data: {
              jobName: alert.jobName,
              status: alert.status,
              senderEmail: alert.senderEmail,
              senderName: alert.senderName,
              senderDomain: alert.senderDomain,
              subject: alert.subject,
              bodySnippet: alert.bodySnippet,
              messageId: alert.messageId,
              receivedAt: alert.receivedAt,
              organizationId: org?.id ?? null,
              organizationName: org?.name ?? null,
            },
          });
          newAlerts++;

          // Notification agents uniquement sur échec de sauvegarde —
          // on ne spamme pas sur les runs OK. Fire-and-forget + respect
          // des préférences utilisateur (backup_failed event).
          if (alert.status === "FAILED") {
            import("@/lib/notifications/dispatch")
              .then((m) =>
                m.dispatchBackupAlert({
                  organizationName: org?.name ?? alert.senderDomain,
                  jobName: alert.jobName,
                  detail: alert.bodySnippet?.slice(0, 200),
                }),
              )
              .catch(() => {});
          }
        } catch (err) {
          errors.push(
            `Message ${msg.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Follow pagination
      const rawNext: string | undefined = page["@odata.nextLink"];
      if (rawNext) {
        // The nextLink is a full URL — strip the base to use our graphFetch
        nextLink = rawNext.replace("https://graph.microsoft.com/v1.0", "");
      } else {
        nextLink = null;
      }
    }
    } // end for each folder
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { fetched, newAlerts, errors };
}
