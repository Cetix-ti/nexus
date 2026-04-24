// ============================================================================
// MONITORING ALERT EMAIL SYNC — Microsoft Graph
// Reads monitoring alert emails from configured folders, parses them,
// detects source type (Zabbix, Atera, FortiGate, Wazuh, etc.),
// matches to orgs, deduplicates, and detects resolutions.
// ============================================================================

import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitoringEmailConfig {
  mailbox: string;
  folders: string[]; // Alert monitoring folders, e.g. ["Inbox/ZABBIX", "Inbox/FORTIGATE"]
  backupFolders?: string[]; // Backup status emails folders, e.g. ["Inbox/VEEAM"]
  /**
   * Dossiers scannés par le Centre de sécurité (AD, Wazuh, etc.). Chaque
   * message est passé d'abord dans le décodeur AD (par sujet), puis dans
   * le décodeur Wazuh en fallback. Les messages non reconnus sont ignorés.
   */
  securityFolders?: string[];
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
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_KEY = "monitoring.email";

export async function getMonitoringConfig(): Promise<MonitoringEmailConfig | null> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return null;
  return row.value as unknown as MonitoringEmailConfig;
}

export async function setMonitoringConfig(config: MonitoringEmailConfig) {
  await prisma.tenantSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: config as any },
    update: { value: config as any },
  });
}

// ---------------------------------------------------------------------------
// Graph API (reuses Azure credentials)
// ---------------------------------------------------------------------------

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) throw new Error(`OAuth2 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.accessToken;
}

async function graphFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Folder resolution
// ---------------------------------------------------------------------------

const WELL_KNOWN: Record<string, string> = {
  inbox: "Inbox", "boîte de réception": "Inbox",
};

async function resolveFolderId(mailbox: string, folderPath: string): Promise<string> {
  const parts = folderPath.split("/").filter(Boolean);
  const base = `/users/${encodeURIComponent(mailbox)}`;
  if (parts.length === 0) {
    return (await graphFetch<GraphFolder>(`${base}/mailFolders/Inbox`)).id;
  }
  let parentId: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      const wk = WELL_KNOWN[part.toLowerCase()];
      if (wk) {
        try { parentId = (await graphFetch<GraphFolder>(`${base}/mailFolders/${wk}`)).id; continue; }
        catch { /* fall through */ }
      }
    }
    const folderUrl: string = parentId ? `${base}/mailFolders/${parentId}/childFolders` : `${base}/mailFolders`;
    const folderRes = await graphFetch<{ value: GraphFolder[] }>(folderUrl);
    const found = folderRes.value.find((f: GraphFolder) => f.displayName.toLowerCase() === part.toLowerCase());
    if (!found) throw new Error(`Dossier "${part}" introuvable`);
    parentId = found.id;
  }
  return parentId!;
}

// ---------------------------------------------------------------------------
// Source detection from email sender/subject
// ---------------------------------------------------------------------------

interface DetectedSource {
  sourceType: string;
  messageKind: "ALERT" | "NOTIFICATION";
  severity: "CRITICAL" | "HIGH" | "WARNING" | "INFO";
  alertGroupKey: string | null;
  isResolution: boolean;
  hostname: string | null;
}

/**
 * Classifie un message comme vraie alerte opérationnelle ou simple
 * notification système. Les NOTIFICATION sont persistées (pour traçabilité)
 * mais cachées du dashboard par défaut.
 *
 * Patterns reconnus comme NOTIFICATION :
 *   - Commentaires sur tâches d'automatisation Atera (email envoyé à chaque
 *     commentaire fait par un tech)
 *   - Invitations / partages d'automatisation
 *   - Digests / résumés périodiques Zabbix
 *   - Newsletters, welcome emails, notifs de login, reset password
 */
function classifyMessageKind(subject: string, body: string): "ALERT" | "NOTIFICATION" {
  const s = subject.toLowerCase();
  const b = body.slice(0, 500).toLowerCase();
  const text = `${s}\n${b}`;

  // Atera — commentaires sur tâches d'automatisation
  if (
    /commentaires?\s+sur\s+les?\s+t[âa]ches?\s+d[’']?automatisation/i.test(text) ||
    /(it\s+)?automation\s+profile\s+comment/i.test(text) ||
    /task\s+comment/i.test(text) ||
    /a\s+comment(\s+has\s+been)?\s+(added|posted)\s+to/i.test(text)
  ) {
    return "NOTIFICATION";
  }

  // Atera — updates sur profils d'automatisation (Upgrade to Windows 11, etc.)
  // Ces sujets contiennent typiquement "(select endpoint manually)" ou le
  // nom d'un profil d'automatisation connu suivi de tags.
  if (
    /\(select\s+endpoint\s+manually\)/i.test(text) ||
    /it\s+automation\s+profile\b/i.test(text) ||
    /automation\s+profile\s+(was|has\s+been)\s+(updated|created|shared)/i.test(text)
  ) {
    return "NOTIFICATION";
  }

  // Digests Zabbix/autres — "daily report", "weekly summary"
  if (
    /daily\s+(report|summary|digest)/i.test(text) ||
    /weekly\s+(report|summary|digest)/i.test(text) ||
    /r[ée]sum[ée]\s+(quotidien|hebdomadaire)/i.test(text)
  ) {
    return "NOTIFICATION";
  }

  // Newsletter / marketing / compte
  if (
    /\b(welcome|bienvenue)\b/i.test(s) ||
    /\bnewsletter\b/i.test(s) ||
    /password\s+(reset|change)/i.test(s) ||
    /new\s+login\s+(detected|from)/i.test(s) ||
    /(account|compte)\s+(created|activated)/i.test(s)
  ) {
    return "NOTIFICATION";
  }

  return "ALERT";
}

function detectSource(subject: string, senderEmail: string, body: string): DetectedSource {
  const subjectLower = subject.toLowerCase();
  const senderLower = senderEmail.toLowerCase();
  const text = `${subjectLower} ${body.slice(0, 1000).toLowerCase()}`;

  let sourceType = "other";
  if (senderLower.includes("zabbix") || text.includes("zabbix")) sourceType = "zabbix";
  else if (senderLower.includes("atera") || text.includes("atera")) sourceType = "atera";
  else if (text.includes("fortigate") || text.includes("fortinet") || text.includes("fortimail")) sourceType = "fortigate";
  else if (text.includes("wazuh")) sourceType = "wazuh";
  else if (text.includes("bitdefender")) sourceType = "bitdefender";

  const messageKind = classifyMessageKind(subject, body);

  // Severity
  let severity: DetectedSource["severity"] = "WARNING";
  if (text.includes("critical") || text.includes("disaster") || text.includes("critique")) severity = "CRITICAL";
  else if (text.includes("high") || text.includes("élevé")) severity = "HIGH";
  else if (text.includes("information") || text.includes("info") || text.includes("ok")) severity = "INFO";

  // Resolution detection
  const isResolution =
    text.includes("resolved") ||
    text.includes("ok") && (text.includes("problem") || sourceType === "zabbix") ||
    text.includes("recovery") ||
    text.includes("résolu") ||
    subjectLower.startsWith("ok:") ||
    subjectLower.includes("resolved:");

  // Group key for dedup — extract host/service from common patterns
  let alertGroupKey: string | null = null;
  let extractedHost: string | null = null;

  // Atera: "Alerte; (Organisation > HOSTNAME) Problème"
  // This is the most specific Atera pattern — try first
  const ateraParensMatch = subject.match(/\(\s*[^>()]+>\s*([A-Za-z0-9][A-Za-z0-9_\-\.]+)\s*\)/);
  if (ateraParensMatch) {
    extractedHost = ateraParensMatch[1];
  }

  // Zabbix: "Problem: <description> on <host>"
  const zabbixMatch = subject.match(/(?:Problem|Resolved|OK):\s*(.+?)(?:\s+on\s+(.+))?$/i);
  if (zabbixMatch) {
    const desc = zabbixMatch[1]?.trim().slice(0, 80);
    const host = zabbixMatch[2]?.trim().slice(0, 50);
    if (host && !extractedHost) extractedHost = host;
    alertGroupKey = `${sourceType}:${extractedHost || "unknown"}:${desc}`.toLowerCase();
  }

  // Zabbix avec numéro de ticket entre parens : "TK-28599 (VDSA_FTG_50B_ARCHIVES)"
  // Le vrai hostname est entre parenthèses ; le "TK-NNNN" est juste un
  // identifiant interne. On extrait uniquement si pas déjà trouvé, et on
  // privilégie les valeurs qui ressemblent à un hostname (uppercase, au
  // moins un underscore/dash ou une combinaison lettres+chiffres).
  if (!extractedHost && sourceType === "zabbix") {
    const parensMatch = subject.match(/\(([A-Z0-9][A-Z0-9_\-\.]{3,})\)/);
    if (parensMatch) extractedHost = parensMatch[1];
  }

  // Other Atera patterns if not matched above
  if (!extractedHost && sourceType === "atera") {
    const ateraPatterns = [
      /^\s*(?:\[[^\]]+\]\s*)?([A-Z][A-Z0-9][A-Z0-9_\-]+)\s*(?:[:-]|is|has|disconnected|offline|online)/i,
      /\bon\s+([A-Z][A-Z0-9_\-]{2,})/i,
      /\bdevice\s+([A-Z][A-Z0-9_\-]{2,})/i,
    ];
    for (const pattern of ateraPatterns) {
      const m = subject.match(pattern);
      if (m && m[1]) { extractedHost = m[1]; break; }
    }
  }

  // Generic: look for uppercase hostname-like tokens
  if (!extractedHost) {
    const genericMatch = subject.match(/\b([A-Z]{2,6}[-_][A-Z0-9_\-]{2,})\b/);
    if (genericMatch) extractedHost = genericMatch[1];
  }

  if (!alertGroupKey) {
    const cleanSubject = subject.replace(/\[.*?\]/g, "").replace(/\d{4}-\d{2}-\d{2}/g, "").trim().slice(0, 80);
    alertGroupKey = `${sourceType}:${extractedHost || "unknown"}:${cleanSubject}`.toLowerCase();
  }

  return { sourceType, messageKind, severity, alertGroupKey, isResolution, hostname: extractedHost };
}

/**
 * Converts HTML email content to plain text, preserving line breaks from
 * block-level elements so that multiline patterns (e.g. "Host: HOSTNAME")
 * remain detectable by line-anchored regexes.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Cherche TOUS les tokens qui ressemblent à un hostname "CODECLIENT-XXX"
 * (ex: "HVAC-SRV01", "BDU_FS02") dans le sujet ET le corps. Uppercase
 * obligatoire pour le préfixe — évite les faux positifs du type "on host"
 * ou "on server".
 *
 * Priorité donnée au format Zabbix "Host: HOSTNAME" dans le body — c'est
 * la ligne la plus fiable puisque c'est là que le template Zabbix met le
 * vrai nom d'hôte, même quand le sujet utilise un placeholder.
 */
function extractAllClientCodePrefixes(subject: string, body: string): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();

  // 1) Priorité : la ligne "Host: XYZ" du body Zabbix.
  // Pas d'ancre de début de ligne stricte : bodyPreview HTML peut être
  // aplati en une seule ligne sans retours chariot.
  const zabbixHost = body.match(/(?:^|[\n\r])\s*Host:\s*([A-Z][A-Z0-9_\-\.]+)/im);
  if (zabbixHost) {
    const name = zabbixHost[1];
    // Préfixe = 2–8 lettres suivies d'un digit OU d'un séparateur. Aligne
    // avec resolveOrgByEndpoint de security-center pour les hostnames du
    // type "DLSN54-2204D" (code collé aux chiffres sans underscore).
    const prefixMatch = name.match(/^([A-Z]{2,8})(?=\d|[-_])/);
    if (prefixMatch && !seen.has(prefixMatch[1])) {
      seen.add(prefixMatch[1]);
      codes.push(prefixMatch[1]);
    }
  }

  // 2) Hostname entre parenthèses dans le sujet (format Zabbix avec
  //    numéro de ticket : "TK-28599 (VDSA_FTG_50B_ARCHIVES)"). On extrait
  //    ce hostname AVANT le scan générique pour que son préfixe soit en
  //    tête de liste et gagne sur un "TK-28599" qui pourrait matcher si
  //    un clientCode "TK" existait un jour.
  const parensHost = subject.match(/\(([A-Z0-9][A-Z0-9_\-\.]{3,})\)/);
  if (parensHost) {
    const prefixMatch = parensHost[1].match(/^([A-Z]{2,8})(?=\d|[-_])/);
    if (prefixMatch && !seen.has(prefixMatch[1])) {
      seen.add(prefixMatch[1]);
      codes.push(prefixMatch[1]);
    }
  }

  // 3) Tous les autres tokens "CODE(sep|digit)CHAR" dans sujet + body.
  //    Même règle que resolveOrgByEndpoint : un digit IMMÉDIAT après le
  //    code (DLSN54…) est accepté, pas seulement un séparateur.
  const text = `${subject}\n${body.slice(0, 2000)}`;
  const re = /\b([A-Z]{2,8})(?:\d|[-_])[A-Z0-9]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      codes.push(m[1]);
    }
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Domain → org matching
// ---------------------------------------------------------------------------

interface OrgMaps {
  domainMap: Map<string, { id: string; name: string }>;
  clientCodeMap: Map<string, { id: string; name: string }>;
  nameMap: Map<string, { id: string; name: string }>;
}

async function buildOrgMaps(): Promise<OrgMaps> {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, domain: true, domains: true, clientCode: true },
  });
  const domainMap = new Map<string, { id: string; name: string }>();
  const clientCodeMap = new Map<string, { id: string; name: string }>();
  const nameMap = new Map<string, { id: string; name: string }>();
  for (const org of orgs) {
    if (org.domain) domainMap.set(org.domain.toLowerCase(), { id: org.id, name: org.name });
    for (const d of org.domains ?? []) {
      if (d) domainMap.set(d.toLowerCase(), { id: org.id, name: org.name });
    }
    // Map client code prefix (e.g., "BDU" → Baie-D'Urfé)
    if (org.clientCode) {
      clientCodeMap.set(org.clientCode.toUpperCase(), { id: org.id, name: org.name });
    }
    // Map org name (normalized) → org (for Atera subjects with org name in parens)
    nameMap.set(org.name.toLowerCase().trim(), { id: org.id, name: org.name });
  }
  return { domainMap, clientCodeMap, nameMap };
}

/** Extract organization name from an Atera-style subject line */
function extractOrgNameFromSubject(subject: string): string | null {
  const match = subject.match(/\(\s*([^>()]+?)\s*>\s*[^()]+\)/);
  return match && match[1] ? match[1].trim() : null;
}

/** Extract client code prefix from Zabbix host name (e.g., "BDU_SERVER01" → "BDU").
 *  Uppercase-only pour éviter de matcher "on server", "on host", etc. */
function extractClientPrefix(subject: string): string | null {
  // Cherche un hostname "CODE-XXX" après "on " ou "host "
  const hostMatch = subject.match(/\b(?:on|host|device)\s+([A-Z]{2,8})[-_]/);
  if (hostMatch) return hostMatch[1];
  // Fallback : préfixe au début d'un token qui ressemble à un hostname
  const prefixMatch = subject.match(/\b([A-Z]{2,8})[-_][A-Z0-9]/);
  if (prefixMatch) return prefixMatch[1];
  return null;
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

/**
 * Liste récursivement les dossiers sous Inbox (jusqu'à `MAX_DEPTH` niveaux).
 * Chaque entrée renvoie à la fois `path` (utilisé par resolveFolderId, ex:
 * "Boîte de réception/WAZUH/Syscollector") et `depth` pour que l'UI puisse
 * indenter l'affichage. On limite la profondeur pour éviter d'hammer Graph
 * sur des arborescences monstres (archives IMAP legacy, etc.).
 */
const MAX_FOLDER_DEPTH = 4;

export async function testMonitoringConnection(mailbox: string): Promise<{
  ok: boolean;
  error?: string;
  folders?: string[];
}> {
  try {
    await getAccessToken();
    const base = `/users/${encodeURIComponent(mailbox)}`;
    const results: string[] = [];

    async function walk(parentId: string, trail: string[], depth: number) {
      if (depth > MAX_FOLDER_DEPTH) return;
      const res = await graphFetch<{ value: GraphFolder[] }>(
        `${base}/mailFolders/${parentId}/childFolders?$top=100&$select=id,displayName`,
      );
      // Itère séquentiellement : on veut un ordre stable dans la réponse
      // (parent avant enfants) pour que l'UI puisse indenter proprement.
      for (const f of res.value) {
        const path = [...trail, f.displayName].join("/");
        results.push(path);
        await walk(f.id, [...trail, f.displayName], depth + 1);
      }
    }

    // Départ depuis Inbox — on expose le label francophone pour rester
    // cohérent avec l'UI et avec resolveFolderId qui mappe via WELL_KNOWN.
    const inbox = await graphFetch<GraphFolder>(`${base}/mailFolders/Inbox`);
    await walk(inbox.id, ["Boîte de réception"], 1);

    return { ok: true, folders: results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export async function syncMonitoringAlerts(
  config?: MonitoringEmailConfig | null,
  options?: { sinceDays?: number },
): Promise<{
  fetched: number;
  created: number;
  resolved: number;
  skipped: number;
  errors: string[];
}> {
  const cfg = config ?? (await getMonitoringConfig());
  if (!cfg || !cfg.folders.length) {
    return { fetched: 0, created: 0, resolved: 0, skipped: 0, errors: ["Configuration non définie"] };
  }

  const errors: string[] = [];
  let fetched = 0;
  let created = 0;
  let resolved = 0;
  let skipped = 0;

  try {
    const { domainMap, clientCodeMap, nameMap } = await buildOrgMaps();

    // Agent qui sera le "créateur" des tickets auto-générés par la
    // synchro monitoring. Pris parmi les admins/techs actifs. Si aucun
    // agent n'existe, on ne crée pas de ticket (mais on persiste quand
    // même l'alerte brute).
    const syncAgent = await prisma.user.findFirst({
      where: {
        role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "TECHNICIAN"] },
        isActive: true,
      },
      select: { id: true },
    });

    // Determine since date
    // sinceDays: undefined = incremental, 0 = all history, N = last N days
    const sinceDays = options?.sinceDays;
    let since: Date;
    if (sinceDays === undefined) {
      const latest = await prisma.monitoringAlert.findFirst({
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      });
      since = latest
        ? new Date(latest.receivedAt.getTime() - 2 * 60 * 60 * 1000)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (sinceDays === 0) {
      since = new Date(0); // all history
    } else {
      since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    }

    for (const folder of cfg.folders) {
      try {
        const folderId = await resolveFolderId(cfg.mailbox, folder);
        let nextLink: string | null =
          `/users/${encodeURIComponent(cfg.mailbox)}/mailFolders/${folderId}/messages` +
          `?$filter=receivedDateTime ge ${since.toISOString()}` +
          `&$orderby=receivedDateTime asc` +
          `&$top=50` +
          `&$select=id,internetMessageId,subject,from,receivedDateTime,bodyPreview,body`;

        interface GraphPage { value: GraphMessage[]; "@odata.nextLink"?: string; }

        while (nextLink) {
          const page: GraphPage = await graphFetch<GraphPage>(nextLink);

          for (const msg of page.value) {
            fetched++;
            try {
              const messageId = msg.internetMessageId || `graph-${msg.id}`;

              // Dedup
              const exists = await prisma.monitoringAlert.findUnique({
                where: { messageId },
                select: { id: true },
              });
              if (exists) { skipped++; continue; }

              const senderEmail = msg.from?.emailAddress?.address?.toLowerCase() || "";
              const senderDomain = senderEmail.split("@")[1] || "";
              // Utilise le corps complet (HTML converti en texte) plutôt que
              // bodyPreview (255 car.) pour ne pas manquer "Host: VDSA-SRV01"
              // quand il apparaît après les premiers caractères de l'email.
              const rawContent = msg.body.content || msg.bodyPreview || "";
              const bodyText = msg.body.contentType === "html" ? htmlToText(rawContent) : rawContent;

              const detected = detectSource(msg.subject, senderEmail, bodyText);

              // Match org: plusieurs stratégies en cascade.
              let org = domainMap.get(senderDomain);
              // Atera: org name in parens "(Organisation > HOST)"
              if (!org) {
                const orgFromSubject = extractOrgNameFromSubject(msg.subject);
                if (orgFromSubject) {
                  org = nameMap.get(orgFromSubject.toLowerCase().trim()) ?? undefined;
                }
              }
              // Zabbix/Atera : extract client code from hostname prefix
              if (!org && detected.hostname) {
                const prefixMatch = detected.hostname.match(/^([A-Za-z]{2,8})[-_]/);
                if (prefixMatch) {
                  org = clientCodeMap.get(prefixMatch[1].toUpperCase()) ?? undefined;
                }
              }
              // Cherche TOUS les hostnames "CODE-xxx" dans le sujet + le body.
              // Utile quand le hostname est dans le corps de l'alerte
              // (ex: Zabbix met "Host: HVAC-SRV01" dans le body).
              if (!org) {
                const allPrefixes = extractAllClientCodePrefixes(msg.subject, bodyText);
                for (const prefix of allPrefixes) {
                  const match = clientCodeMap.get(prefix);
                  if (match) {
                    org = match;
                    break;
                  }
                }
              }
              if (!org) {
                const prefix = extractClientPrefix(msg.subject);
                if (prefix) org = clientCodeMap.get(prefix) ?? undefined;
              }

              // Si c'est une résolution : marquer l'alerte originale ET son
              // ticket comme résolus. Ne pas créer de nouvelle alerte ni
              // de nouveau ticket : le message de résolution n'est qu'un
              // événement qui met à jour l'existant.
              if (detected.isResolution && detected.alertGroupKey) {
                const openAlert = await prisma.monitoringAlert.findFirst({
                  where: {
                    alertGroupKey: detected.alertGroupKey,
                    isResolved: false,
                  },
                  orderBy: { receivedAt: "desc" },
                  select: { id: true, ticketId: true },
                });
                if (openAlert) {
                  await prisma.monitoringAlert.update({
                    where: { id: openAlert.id },
                    data: {
                      isResolved: true,
                      resolvedAt: new Date(msg.receivedDateTime),
                      stage: "RESOLVED",
                    },
                  });
                  // Close the linked ticket too.
                  if (openAlert.ticketId) {
                    await prisma.ticket.update({
                      where: { id: openAlert.ticketId },
                      data: {
                        status: "RESOLVED",
                        resolvedAt: new Date(msg.receivedDateTime),
                        monitoringStage: "RESOLVED",
                      },
                    });
                  }
                  resolved++;
                }
                // On ne crée PAS d'alerte persistée pour un message de
                // résolution — évite le bruit dans le dashboard.
                skipped++;
                continue;
              }

              // Dedup par alertGroupKey : si une alerte non-résolue du
              // même groupe existe déjà (ex: "zabbix:mrvl_mv-dc-01:disk space"),
              // on append un commentaire au ticket existant au lieu de
              // recréer un doublon dans le kanban.
              if (
                detected.messageKind === "ALERT" &&
                detected.alertGroupKey &&
                !detected.isResolution
              ) {
                const existingOpen = await prisma.monitoringAlert.findFirst({
                  where: {
                    alertGroupKey: detected.alertGroupKey,
                    isResolved: false,
                  },
                  orderBy: { receivedAt: "desc" },
                  select: { id: true, ticketId: true },
                });
                if (existingOpen) {
                  // Bump le timestamp et ajoute un commentaire résumé sur
                  // le ticket existant. L'alerte dupliquée n'est pas
                  // persistée — évite la pollution du dashboard.
                  if (existingOpen.ticketId && syncAgent) {
                    try {
                      await prisma.comment.create({
                        data: {
                          ticketId: existingOpen.ticketId,
                          authorId: syncAgent.id,
                          body: `Répétition de l'alerte (${detected.sourceType.toUpperCase()}) reçue le ${new Date(msg.receivedDateTime).toLocaleString("fr-CA")}.\nSujet : ${msg.subject}`,
                          isInternal: true,
                        },
                      });
                    } catch {
                      /* non bloquant */
                    }
                  }
                  skipped++;
                  continue;
                }
              }

              // Toujours persister l'enregistrement (même les notifications
              // système et les résolutions), mais les notifications seront
              // filtrées du dashboard par défaut via messageKind.
              const alertRow = await prisma.monitoringAlert.create({
                data: {
                  organizationId: org?.id ?? null,
                  organizationName: org?.name ?? null,
                  sourceType: detected.sourceType,
                  messageKind: detected.messageKind,
                  severity: detected.severity,
                  stage: detected.isResolution ? "RESOLVED" : "TRIAGE",
                  subject: msg.subject,
                  body: bodyText.slice(0, 5000),
                  senderEmail,
                  senderDomain,
                  messageId,
                  receivedAt: new Date(msg.receivedDateTime),
                  isResolved: detected.isResolution,
                  resolvedAt: detected.isResolution ? new Date(msg.receivedDateTime) : null,
                  alertGroupKey: detected.alertGroupKey,
                },
              });

              // Auto-création d'un ticket pour chaque ALERT (jamais pour
              // les NOTIFICATION ni les messages de résolution). Chaque
              // alerte EST un ticket dès son arrivée : saisies de temps,
              // commentaires, assignation, etc. — tout l'outillage ticket
              // devient disponible directement depuis la tuile kanban.
              if (
                detected.messageKind === "ALERT" &&
                !detected.isResolution &&
                org?.id &&
                syncAgent
              ) {
                try {
                  const ticket = await prisma.ticket.create({
                    data: {
                      organizationId: org.id,
                      creatorId: syncAgent.id,
                      subject: `[Monitoring] ${msg.subject}`,
                      description:
                        `Alerte ${detected.sourceType.toUpperCase()} reçue le ${new Date(msg.receivedDateTime).toLocaleString("fr-CA")}.\n\n` +
                        `Expéditeur : ${senderEmail}\n` +
                        (detected.hostname ? `Hôte : ${detected.hostname}\n` : "") +
                        `\n${bodyText.slice(0, 2000)}`,
                      status: "NEW",
                      priority:
                        detected.severity === "CRITICAL"
                          ? "CRITICAL"
                          : detected.severity === "HIGH"
                          ? "HIGH"
                          : "MEDIUM",
                      type: "ALERT",
                      source: "MONITORING",
                      monitoringStage: "TRIAGE",
                    },
                    select: { id: true },
                  });
                  await prisma.monitoringAlert.update({
                    where: { id: alertRow.id },
                    data: { ticketId: ticket.id },
                  });
                } catch (err) {
                  // Non bloquant : l'alerte est déjà persistée, le ticket
                  // pourra être créé à la main depuis l'UI si besoin.
                  errors.push(
                    `Auto-ticket ${alertRow.id}: ${err instanceof Error ? err.message : String(err)}`,
                  );
                }
              }
              // Notification agents sur les VRAIES alertes (pas les
              // messages de résolution ni les notifications système). Le
              // dispatcher central respecte les préférences "monitoring_alert"
              // des utilisateurs.
              if (
                detected.messageKind === "ALERT" &&
                !detected.isResolution &&
                (detected.severity === "CRITICAL" || detected.severity === "HIGH")
              ) {
                import("@/lib/notifications/dispatch")
                  .then((m) =>
                    m.dispatchMonitoringAlert({
                      organizationName: org?.name ?? senderDomain,
                      alertTitle: msg.subject || "Alerte sans sujet",
                      severity: detected.severity.toLowerCase(),
                      body: bodyText.slice(0, 400),
                    }),
                  )
                  .catch(() => {});
              }
              created++;
            } catch (err) {
              errors.push(`${msg.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          const rawNext: string | undefined = page["@odata.nextLink"];
          nextLink = rawNext ? rawNext.replace("https://graph.microsoft.com/v1.0", "") : null;
        }
      } catch (err) {
        errors.push(`Dossier "${folder}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ---- Backfill : ré-associe les alertes sans organisation ----
    // Re-traite les alertes stockées avec organizationId=null en utilisant
    // les maps org courantes. Corrige les alertes ingérées avant qu'un code
    // client soit configuré, ou dont le bodyPreview était trop court.
    try {
      const unmatched = await prisma.monitoringAlert.findMany({
        where: { organizationId: null, messageKind: "ALERT" },
        select: { id: true, subject: true, body: true, senderDomain: true },
        orderBy: { receivedAt: "desc" },
        take: 500,
      });
      for (const a of unmatched) {
        let aOrg = domainMap.get(a.senderDomain);
        if (!aOrg) {
          const orgName = extractOrgNameFromSubject(a.subject);
          if (orgName) aOrg = nameMap.get(orgName.toLowerCase().trim()) ?? undefined;
        }
        if (!aOrg) {
          const prefixes = extractAllClientCodePrefixes(a.subject, a.body || "");
          for (const p of prefixes) {
            const m = clientCodeMap.get(p);
            if (m) { aOrg = m; break; }
          }
        }
        if (!aOrg) {
          const p = extractClientPrefix(a.subject);
          if (p) aOrg = clientCodeMap.get(p) ?? undefined;
        }
        if (aOrg) {
          await prisma.monitoringAlert.update({
            where: { id: a.id },
            data: { organizationId: aOrg.id, organizationName: aOrg.name },
          });
        }
      }
    } catch {
      /* non-bloquant */
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { fetched, created, resolved, skipped, errors };
}
