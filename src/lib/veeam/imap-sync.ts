import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VeeamImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  folder: string; // e.g. "INBOX/Veeam" or "Alertes/Veeam"
}

export type VeeamStatus = "SUCCESS" | "WARNING" | "FAILED";

interface ParsedVeeamAlert {
  jobName: string;
  status: VeeamStatus;
  senderEmail: string;
  senderDomain: string;
  subject: string;
  bodySnippet: string;
  messageId: string;
  receivedAt: Date;
}

// ---------------------------------------------------------------------------
// Config persistence via TenantSetting
// ---------------------------------------------------------------------------

const CONFIG_KEY = "veeam.imap";

export async function getVeeamImapConfig(): Promise<VeeamImapConfig | null> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return null;
  return row.value as unknown as VeeamImapConfig;
}

export async function setVeeamImapConfig(config: VeeamImapConfig) {
  await prisma.tenantSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: config as any },
    update: { value: config as any },
  });
}

// ---------------------------------------------------------------------------
// Veeam email parser
// ---------------------------------------------------------------------------

function parseVeeamStatus(subject: string, body: string): VeeamStatus {
  const text = `${subject} ${body}`.toLowerCase();
  if (text.includes("failed") || text.includes("error") || text.includes("échoué")) return "FAILED";
  if (text.includes("warning") || text.includes("avertissement")) return "WARNING";
  return "SUCCESS";
}

function extractJobName(subject: string): string {
  // Common Veeam subject patterns:
  // "[SUCCESS] Job Name 2026-04-09"
  // "Veeam Backup Job: Job Name - Success"
  // "[FAILED] Job Name"
  const bracketMatch = subject.match(/\[(?:SUCCESS|FAILED|WARNING)\]\s*(.+?)(?:\s+\d{4}-\d{2}-\d{2}.*)?$/i);
  if (bracketMatch) return bracketMatch[1].trim();

  const colonMatch = subject.match(/(?:Veeam.*?Job|Backup.*?Job)[:\s]+(.+?)(?:\s*-\s*(?:Success|Failed|Warning))?$/i);
  if (colonMatch) return colonMatch[1].trim();

  // Fallback: strip status keywords and dates
  return subject
    .replace(/\[(SUCCESS|FAILED|WARNING)\]/gi, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(/\b(success|failed|warning|veeam|backup|job)\b/gi, "")
    .replace(/[:\-]+/g, " ")
    .trim() || subject;
}

function parseSenderDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function parseVeeamEmail(mail: any): ParsedVeeamAlert | null {
  const subject = mail.subject ?? "";
  const from = mail.from?.value?.[0]?.address ?? "";
  if (!from) return null;

  const body = mail.text ?? "";
  const bodySnippet = body.slice(0, 500);

  return {
    jobName: extractJobName(subject),
    status: parseVeeamStatus(subject, body),
    senderEmail: from.toLowerCase(),
    senderDomain: parseSenderDomain(from),
    subject,
    bodySnippet,
    messageId: mail.messageId ?? `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: mail.date ?? new Date(),
  };
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
// IMAP Sync
// ---------------------------------------------------------------------------

export async function testImapConnection(config: VeeamImapConfig): Promise<{
  ok: boolean;
  error?: string;
  folders?: string[];
}> {
  // For Exchange/O365: port 993 = implicit TLS (secure: true)
  // port 143 = STARTTLS (secure: false, but upgraded)
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
    // Exchange Online can be slow to respond
    greetTimeout: 15000,
  } as any);

  try {
    await client.connect();
    const tree = await client.listTree();
    const folders: string[] = [];
    function walk(items: any[]) {
      for (const item of items) {
        if (item.path) folders.push(item.path);
        if (item.folders?.length) walk(item.folders);
      }
    }
    walk(tree.folders ?? []);
    try { await client.logout(); } catch { /* ignore logout errors */ }
    return { ok: true, folders };
  } catch (err: any) {
    try { await client.logout(); } catch { /* ignore */ }
    // Extract the most useful error message
    const msg = err?.responseText || err?.response || err?.message || String(err);
    const code = err?.authenticationFailed ? "Authentification refusée — vérifiez l'utilisateur et le mot de passe." : null;
    const detail = code || (typeof msg === "string" ? msg : JSON.stringify(msg));
    console.error("[Veeam IMAP test] Error:", detail, err);
    return { ok: false, error: detail };
  }
}

export async function syncVeeamAlerts(config?: VeeamImapConfig | null): Promise<{
  fetched: number;
  newAlerts: number;
  errors: string[];
}> {
  const cfg = config ?? (await getVeeamImapConfig());
  if (!cfg) return { fetched: 0, newAlerts: 0, errors: ["Configuration IMAP non définie"] };

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
    greetTimeout: 15000,
  } as any);

  const errors: string[] = [];
  let fetched = 0;
  let newAlerts = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(cfg.folder);

    try {
      // Get the most recent message ID we already have so we only fetch new ones
      const latest = await prisma.veeamBackupAlert.findFirst({
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      });
      const since = latest
        ? new Date(latest.receivedAt.getTime() - 24 * 60 * 60 * 1000) // overlap 24h for safety
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // first run: last 30 days

      const messages = client.fetch(
        { since },
        { source: true, envelope: true, uid: true },
      );

      const domainMap = await buildDomainMap();

      for await (const msg of messages) {
        fetched++;
        try {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source as any);
          const alert = parseVeeamEmail(parsed);
          if (!alert) continue;

          // Check dupe by messageId
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
        } catch (err) {
          errors.push(`Message UID ${msg.uid}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      lock.release();
    }

    try { await client.logout(); } catch { /* ignore */ }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    try { await client.logout(); } catch { /* ignore */ }
  }

  return { fetched, newAlerts, errors };
}
