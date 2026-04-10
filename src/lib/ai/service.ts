// ============================================================================
// AI ASSISTANT SERVICE
// Calls OpenAI (or any compatible API) with Nexus context.
// Designed to be swappable to Claude, Ollama, or any local model.
// ============================================================================

import prisma from "@/lib/prisma";

const OPENAI_API_KEY = () => process.env.OPENAI_API_KEY;
const MODEL = () => process.env.AI_MODEL || "gpt-4o-mini";
const API_URL = () =>
  process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Core chat completion — provider-agnostic
// ---------------------------------------------------------------------------

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const apiKey = OPENAI_API_KEY();
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurée");

  const res = await fetch(API_URL(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL(),
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ---------------------------------------------------------------------------
// RAG — Retrieval-Augmented Generation
// Searches Nexus DB for relevant data based on the user's query,
// then injects the results into the prompt.
// ---------------------------------------------------------------------------

// Intent categories for smarter routing
type QueryIntent = "tickets" | "backups" | "monitoring" | "contacts" | "assets" | "kb" | "time" | "general";

/** Detect what the user is asking about */
function detectIntents(message: string): QueryIntent[] {
  const m = message.toLowerCase();
  const intents: QueryIntent[] = [];

  if (/ticket|billet|incident|demande|problème|bug|erreur|panne/.test(m)) intents.push("tickets");
  if (/sauvegarde|backup|veeam|bkp|restaur/.test(m)) intents.push("backups");
  if (/monitoring|alerte|zabbix|surveillance|atera|fortigate|wazuh/.test(m)) intents.push("monitoring");
  if (/contact|utilisateur|client|employé|personne|qui est/.test(m)) intents.push("contacts");
  if (/actif|serveur|poste|équipement|matériel|asset|ordinateur|laptop|imprimante/.test(m)) intents.push("assets");
  if (/article|documentation|procédure|base de connaissance|kb|wiki|comment faire/.test(m)) intents.push("kb");
  if (/temps|heure|facturable|saisie|timesheet/.test(m)) intents.push("time");

  // If no specific intent, search everything
  if (intents.length === 0) intents.push("general");
  return intents;
}

/** Detect date range from natural language */
function detectDateRange(message: string): { since: Date; label: string } | null {
  const m = message.toLowerCase();
  const now = new Date();

  if (/aujourd'hui|today|ce jour/.test(m)) {
    const since = new Date(now); since.setHours(0, 0, 0, 0);
    return { since, label: "aujourd'hui" };
  }
  if (/hier|yesterday/.test(m)) {
    const since = new Date(now); since.setDate(since.getDate() - 1); since.setHours(0, 0, 0, 0);
    return { since, label: "hier" };
  }
  if (/cette semaine|this week/.test(m)) {
    const since = new Date(now); since.setDate(since.getDate() - since.getDay());
    since.setHours(0, 0, 0, 0);
    return { since, label: "cette semaine" };
  }
  if (/semaine dernière|last week/.test(m)) {
    const since = new Date(now); since.setDate(since.getDate() - 7 - since.getDay());
    since.setHours(0, 0, 0, 0);
    return { since, label: "la semaine dernière" };
  }
  if (/ce mois|this month/.test(m)) {
    const since = new Date(now.getFullYear(), now.getMonth(), 1);
    return { since, label: "ce mois-ci" };
  }
  if (/mois dernier|le mois passé|last month/.test(m)) {
    const since = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { since, label: "le mois dernier" };
  }
  if (/dernier(?:s|es)?\s*(\d+)\s*jours?|last\s*(\d+)\s*days?/.test(m)) {
    const match = m.match(/(\d+)\s*jours?/);
    const days = match ? parseInt(match[1]) : 7;
    const since = new Date(now); since.setDate(since.getDate() - days);
    return { since, label: `les ${days} derniers jours` };
  }
  if (/24\s*h|24\s*heures/.test(m)) {
    return { since: new Date(now.getTime() - 24 * 60 * 60 * 1000), label: "les dernières 24h" };
  }
  if (/48\s*h|48\s*heures/.test(m)) {
    return { since: new Date(now.getTime() - 48 * 60 * 60 * 1000), label: "les dernières 48h" };
  }

  return null;
}

/** Detect organization names mentioned in the query */
async function detectOrgNames(message: string): Promise<string[]> {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { name: true },
  });
  const m = message.toLowerCase();
  return orgs
    .filter((o) => m.includes(o.name.toLowerCase()))
    .map((o) => o.name);
}

/** Extract search terms from a natural language question */
function extractSearchTerms(message: string): string[] {
  const stopWords = new Set([
    "le", "la", "les", "de", "du", "des", "un", "une", "et", "ou", "en",
    "est", "ce", "que", "qui", "quoi", "dans", "pour", "sur", "avec",
    "mon", "ma", "mes", "son", "sa", "ses", "nous", "vous", "leur",
    "quel", "quelle", "quels", "quelles", "comment", "pourquoi",
    "combien", "quand", "fait", "faire", "été", "avoir", "être",
    "pas", "plus", "très", "bien", "aussi", "tout", "tous", "cette",
    "ces", "aux", "par", "il", "elle", "ils", "elles", "je", "tu",
    "moi", "toi", "lui", "eux", "se", "ne", "si", "mais", "donc",
    "car", "ni", "the", "and", "is", "are", "was", "has", "have",
    "can", "could", "would", "should", "will", "does", "did",
    "chez", "nos", "entre", "comme", "après", "avant", "depuis",
    "encore", "même", "autre", "chaque", "sans", "sous", "vers",
  ]);

  return message
    .toLowerCase()
    .replace(/[?!.,;:'"()[\]{}]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

/** Search tickets, comments, and descriptions matching the query */
async function searchTickets(
  query: string,
  dateRange: { since: Date } | null,
  orgNames: string[],
  limit = 15,
): Promise<string> {
  const terms = extractSearchTerms(query);

  const where: any = {};

  // Date filter
  if (dateRange) where.createdAt = { gte: dateRange.since };

  // Org filter
  if (orgNames.length > 0) {
    where.organization = { name: { in: orgNames } };
  }

  // Text search — if terms exist
  if (terms.length > 0) {
    where.OR = terms.flatMap((term) => [
      { subject: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
      { comments: { some: { body: { contains: term, mode: "insensitive" as const } } } },
    ]);
  }

  // If no filters at all, don't search
  if (!where.OR && !where.createdAt && !where.organization) return "";

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      organization: { select: { name: true } },
      requester: { select: { firstName: true, lastName: true } },
      assignee: { select: { firstName: true, lastName: true } },
      comments: { select: { body: true, createdAt: true }, take: 3, orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  if (tickets.length === 0) return "";

  return tickets.map((t) => {
    const comments = t.comments.length > 0
      ? `\n  Commentaires: ${t.comments.map((c) => c.body.slice(0, 150)).join(" | ")}`
      : "";
    return `INC-${1000 + t.number}: ${t.subject} [${t.status}/${t.priority}] — ${t.organization?.name ?? "?"} — Demandeur: ${t.requester ? `${t.requester.firstName} ${t.requester.lastName}` : "?"} — Assigné: ${t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Non assigné"} — ${t.createdAt.toLocaleDateString("fr-CA")}\n  Description: ${t.description.slice(0, 200)}${comments}`;
  }).join("\n\n");
}

/** Search Veeam alerts matching the query */
async function searchVeeamAlerts(
  query: string,
  dateRange: { since: Date } | null,
  orgNames: string[],
  limit = 10,
): Promise<string> {
  const terms = extractSearchTerms(query);
  const where: any = {};

  if (dateRange) where.receivedAt = { gte: dateRange.since };
  if (orgNames.length > 0) where.organizationName = { in: orgNames };

  if (terms.length > 0) {
    where.OR = terms.flatMap((term) => [
      { subject: { contains: term, mode: "insensitive" as const } },
      { jobName: { contains: term, mode: "insensitive" as const } },
      { organizationName: { contains: term, mode: "insensitive" as const } },
      { senderEmail: { contains: term, mode: "insensitive" as const } },
    ]);
  }

  if (!where.OR && !where.receivedAt && !where.organizationName) return "";

  const alerts = await prisma.veeamBackupAlert.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: limit,
  });

  if (alerts.length === 0) return "";
  return alerts.map((a) =>
    `[${a.status}] ${a.jobName} — ${a.organizationName ?? "?"} — ${a.senderEmail} — ${a.receivedAt.toLocaleDateString("fr-CA")}`,
  ).join("\n");
}

/** Search monitoring alerts matching the query */
async function searchMonitoringAlerts(
  query: string,
  dateRange: { since: Date } | null,
  orgNames: string[],
  limit = 10,
): Promise<string> {
  const terms = extractSearchTerms(query);
  const where: any = {};

  if (dateRange) where.receivedAt = { gte: dateRange.since };
  if (orgNames.length > 0) where.organizationName = { in: orgNames };

  if (terms.length > 0) {
    where.OR = terms.flatMap((term) => [
      { subject: { contains: term, mode: "insensitive" as const } },
      { organizationName: { contains: term, mode: "insensitive" as const } },
      { body: { contains: term, mode: "insensitive" as const } },
    ]);
  }

  if (!where.OR && !where.receivedAt && !where.organizationName) return "";

  const alerts = await prisma.monitoringAlert.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: limit,
  });

  if (alerts.length === 0) return "";
  return alerts.map((a) =>
    `[${a.severity}/${a.stage}] ${a.subject} — ${a.organizationName ?? "?"} (${a.sourceType}) — ${a.receivedAt.toLocaleDateString("fr-CA")}`,
  ).join("\n");
}

/** Search KB articles matching the query */
async function searchKbArticles(query: string, limit = 5): Promise<string> {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return "";

  const orConditions = terms.flatMap((term) => [
    { title: { contains: term, mode: "insensitive" as const } },
    { body: { contains: term, mode: "insensitive" as const } },
  ]);

  const articles = await prisma.article.findMany({
    where: { OR: orConditions, status: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { title: true, summary: true, body: true },
  });

  if (articles.length === 0) return "";
  return articles.map((a) =>
    `📄 ${a.title}\n  ${(a.summary || a.body).slice(0, 200)}`,
  ).join("\n\n");
}

/** Search contacts/orgs matching the query */
async function searchContacts(query: string, limit = 10): Promise<string> {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return "";

  const orConditions = terms.flatMap((term) => [
    { firstName: { contains: term, mode: "insensitive" as const } },
    { lastName: { contains: term, mode: "insensitive" as const } },
    { email: { contains: term, mode: "insensitive" as const } },
  ]);

  const contacts = await prisma.contact.findMany({
    where: { OR: orConditions },
    include: { organization: { select: { name: true } } },
    take: limit,
  });

  if (contacts.length === 0) return "";
  return contacts.map((c) =>
    `${c.firstName} ${c.lastName} (${c.email}) — ${c.organization?.name ?? "?"} — ${c.jobTitle ?? ""} — ${c.isActive ? "Actif" : "Inactif"}`,
  ).join("\n");
}

/** Search assets matching the query */
async function searchAssets(
  query: string,
  orgNames: string[],
  limit = 10,
): Promise<string> {
  const terms = extractSearchTerms(query);
  const where: any = {};

  if (orgNames.length > 0) {
    const orgs = await prisma.organization.findMany({
      where: { name: { in: orgNames } },
      select: { id: true },
    });
    if (orgs.length > 0) where.organizationId = { in: orgs.map((o) => o.id) };
  }

  if (terms.length > 0) {
    where.OR = terms.flatMap((term) => [
      { name: { contains: term, mode: "insensitive" as const } },
      { manufacturer: { contains: term, mode: "insensitive" as const } },
      { model: { contains: term, mode: "insensitive" as const } },
      { serialNumber: { contains: term, mode: "insensitive" as const } },
      { ipAddress: { contains: term, mode: "insensitive" as const } },
      { notes: { contains: term, mode: "insensitive" as const } },
    ]);
  }

  if (!where.OR && !where.organizationId) return "";

  const assets = await prisma.asset.findMany({
    where,
    include: {
      organization: { select: { name: true } },
      site: { select: { name: true } },
      assignedContact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { name: "asc" },
    take: limit,
  });

  if (assets.length === 0) return "";
  return assets.map((a) =>
    `${a.name} [${a.type}/${a.status}] — ${a.organization?.name ?? "?"} — ${a.manufacturer ?? ""} ${a.model ?? ""} — IP: ${a.ipAddress ?? "?"} — Site: ${a.site?.name ?? "?"} — Assigné: ${a.assignedContact ? `${a.assignedContact.firstName} ${a.assignedContact.lastName}` : "—"}`,
  ).join("\n");
}

/** Search time entries for stats */
async function searchTimeEntries(
  dateRange: { since: Date } | null,
  orgNames: string[],
): Promise<string> {
  const where: any = {};
  if (dateRange) where.startedAt = { gte: dateRange.since };
  if (orgNames.length > 0) {
    const orgs = await prisma.organization.findMany({
      where: { name: { in: orgNames } },
      select: { id: true },
    });
    if (orgs.length > 0) where.organizationId = { in: orgs.map((o) => o.id) };
  }

  if (!where.startedAt && !where.organizationId) return "";

  const entries = await prisma.timeEntry.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  if (entries.length === 0) return "";
  const total = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const header = `${entries.length} saisies, ${Math.round(total / 60)}h total`;
  const details = entries.slice(0, 10).map((e) =>
    `${e.durationMinutes}min [${e.coverageStatus}] — ${e.description.slice(0, 100)}`,
  ).join("\n");
  return `${header}\n${details}`;
}

/** Master RAG function — smart routing based on intent + date + org detection */
export async function ragSearch(userMessage: string): Promise<string> {
  const intents = detectIntents(userMessage);
  const dateRange = detectDateRange(userMessage);
  const orgNames = await detectOrgNames(userMessage);
  const isGeneral = intents.includes("general");

  const searches: Promise<[string, string]>[] = [];

  // Route searches based on detected intents
  if (isGeneral || intents.includes("tickets")) {
    searches.push(searchTickets(userMessage, dateRange, orgNames).then((r) => ["TICKETS TROUVÉS", r]));
  }
  if (isGeneral || intents.includes("backups")) {
    searches.push(searchVeeamAlerts(userMessage, dateRange, orgNames).then((r) => ["ALERTES VEEAM", r]));
  }
  if (isGeneral || intents.includes("monitoring")) {
    searches.push(searchMonitoringAlerts(userMessage, dateRange, orgNames).then((r) => ["ALERTES MONITORING", r]));
  }
  if (isGeneral || intents.includes("kb")) {
    searches.push(searchKbArticles(userMessage).then((r) => ["ARTICLES KB", r]));
  }
  if (isGeneral || intents.includes("contacts")) {
    searches.push(searchContacts(userMessage).then((r) => ["CONTACTS", r]));
  }
  if (intents.includes("assets")) {
    searches.push(searchAssets(userMessage, orgNames).then((r) => ["ACTIFS", r]));
  }
  if (intents.includes("time")) {
    searches.push(searchTimeEntries(dateRange, orgNames).then((r) => ["SAISIES DE TEMPS", r]));
  }

  const results = await Promise.all(searches);
  const sections = results
    .filter(([, data]) => data.length > 0)
    .map(([label, data]) => `${label}:\n${data}`);

  if (sections.length === 0) return "";

  const contextInfo: string[] = [];
  if (dateRange) contextInfo.push(`Période: ${dateRange.label}`);
  if (orgNames.length > 0) contextInfo.push(`Client(s): ${orgNames.join(", ")}`);
  const contextHeader = contextInfo.length > 0 ? `\n[Filtres détectés: ${contextInfo.join(" | ")}]\n` : "";

  return `\n\nRÉSULTATS DE RECHERCHE PERTINENTS:${contextHeader}\n${sections.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Context builders — fetch Nexus data to inject into prompts
// ---------------------------------------------------------------------------

async function getRecentTicketsSummary(limit = 10): Promise<string> {
  const tickets = await prisma.ticket.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      number: true,
      subject: true,
      status: true,
      priority: true,
      organization: { select: { name: true } },
      assignee: { select: { firstName: true, lastName: true } },
      createdAt: true,
    },
  });
  if (tickets.length === 0) return "Aucun ticket récent.";
  return tickets
    .map(
      (t) =>
        `INC-${1000 + t.number}: ${t.subject} [${t.status}/${t.priority}] - ${t.organization?.name ?? "?"} - ${t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Non assigné"} (${t.createdAt.toLocaleDateString("fr-CA")})`,
    )
    .join("\n");
}

async function getCategoriesList(): Promise<string> {
  const cats = await prisma.category.findMany({
    where: { isActive: true },
    include: { children: { where: { isActive: true }, include: { children: { where: { isActive: true } } } } },
    orderBy: { sortOrder: "asc" },
  });
  const roots = cats.filter((c) => !c.parentId);
  const lines: string[] = [];
  for (const r of roots) {
    lines.push(`- ${r.name}`);
    for (const c of r.children ?? []) {
      lines.push(`  - ${r.name} > ${c.name}`);
      for (const gc of (c as any).children ?? []) {
        lines.push(`    - ${r.name} > ${c.name} > ${gc.name}`);
      }
    }
  }
  return lines.length > 0 ? lines.join("\n") : "Matériel, Logiciels, Réseau & VPN, Compte & Accès, Email, Sécurité";
}

async function getOrgsSummary(): Promise<string> {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { name: true, domain: true },
    orderBy: { name: "asc" },
    take: 30,
  });
  return orgs.map((o) => `${o.name} (${o.domain ?? ""})`).join(", ");
}

async function getAssetsSummary(): Promise<string> {
  const stats = await prisma.asset.groupBy({
    by: ["status"],
    _count: true,
  });
  const total = await prisma.asset.count();
  const byStatus = stats.map((s) => `${s.status}: ${typeof s._count === "number" ? s._count : (s._count as any)?._all ?? 0}`).join(", ");
  return `${total} actifs total (${byStatus})`;
}

async function getContactsSummary(): Promise<string> {
  const total = await prisma.contact.count();
  const portalEnabled = await prisma.contact.count({ where: { portalEnabled: true } });
  return `${total} contacts total, ${portalEnabled} avec accès portail`;
}

async function getTimeEntriesSummary(): Promise<string> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const entries = await prisma.timeEntry.findMany({
    where: { startedAt: { gte: since } },
    select: { durationMinutes: true, coverageStatus: true },
  });
  if (entries.length === 0) return "Aucune saisie de temps cette semaine.";
  const total = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const billable = entries.filter((e) => ["billable", "hour_bank_overage", "msp_overage"].includes(e.coverageStatus)).reduce((s, e) => s + e.durationMinutes, 0);
  return `${entries.length} saisies cette semaine, ${Math.round(total / 60)}h total, ${Math.round(billable / 60)}h facturables`;
}

async function getKbSummary(): Promise<string> {
  const total = await prisma.article.count();
  const published = await prisma.article.count({ where: { status: "PUBLISHED" } });
  return `${total} articles KB (${published} publiés)`;
}

async function getVeeamSummary(): Promise<string> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000); // last 48h
  const alerts = await prisma.veeamBackupAlert.findMany({
    where: { receivedAt: { gte: since } },
    orderBy: { receivedAt: "desc" },
    take: 50,
  });
  if (alerts.length === 0) return "Aucune alerte Veeam dans les dernières 48h.";

  // Group by org
  const byOrg = new Map<string, { success: number; warning: number; failed: number }>();
  for (const a of alerts) {
    const key = a.organizationName ?? "Non associé";
    if (!byOrg.has(key)) byOrg.set(key, { success: 0, warning: 0, failed: 0 });
    const entry = byOrg.get(key)!;
    if (a.status === "SUCCESS") entry.success++;
    else if (a.status === "WARNING") entry.warning++;
    else entry.failed++;
  }

  return Array.from(byOrg.entries())
    .map(([org, s]) => `${org}: ${s.success} succès, ${s.warning} avert., ${s.failed} échecs`)
    .join("\n");
}

async function getMonitoringSummary(): Promise<string> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const alerts = await prisma.monitoringAlert.findMany({
    where: { receivedAt: { gte: since }, isResolved: false },
    orderBy: { receivedAt: "desc" },
    take: 20,
  });
  if (alerts.length === 0) return "Aucune alerte monitoring active.";

  return alerts
    .map((a) => `[${a.severity}/${a.stage}] ${a.subject} — ${a.organizationName ?? "?"} (${a.sourceType})`)
    .join("\n");
}

async function getRecentFeedback(limit = 15): Promise<string> {
  const fb = await prisma.aiCategoryFeedback.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (fb.length === 0) return "";
  return fb
    .map(
      (f) =>
        `Sujet: "${f.subject}" → Catégorie correcte: "${f.confirmedCategory}"`,
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Memory system
// ---------------------------------------------------------------------------

async function getMemories(userId: string): Promise<string> {
  const [global, personal] = await Promise.all([
    prisma.aiMemory.findMany({
      where: { scope: "global" },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.aiMemory.findMany({
      where: { scope: userId },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const lines: string[] = [];
  if (global.length > 0) {
    lines.push("MÉMOIRE CENTRALE (partagée):");
    for (const m of global) lines.push(`  [${m.category}] ${m.content}`);
  }
  if (personal.length > 0) {
    lines.push("\nMÉMOIRE PERSONNELLE (cet agent):");
    for (const m of personal) lines.push(`  [${m.category}] ${m.content}`);
  }
  return lines.join("\n");
}

export async function saveMemory(
  content: string,
  category: string,
  scope: string, // "global" or userId
  source: string,
) {
  await prisma.aiMemory.create({
    data: { scope, category, content, source },
  });
}

export async function deleteMemory(id: string) {
  await prisma.aiMemory.delete({ where: { id } });
}

export async function listMemories(scope?: string) {
  return prisma.aiMemory.findMany({
    where: scope ? { scope } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

// ---------------------------------------------------------------------------
// Build the system prompt with Nexus context + memories
// ---------------------------------------------------------------------------

export async function buildSystemPrompt(userId?: string): Promise<string> {
  const [ticketsSummary, categories, orgs, memories, veeam, monitoring, assets, contacts, timeEntries, kb] = await Promise.all([
    getRecentTicketsSummary(),
    getCategoriesList(),
    getOrgsSummary(),
    userId ? getMemories(userId) : Promise.resolve(""),
    getVeeamSummary(),
    getMonitoringSummary(),
    getAssetsSummary(),
    getContactsSummary(),
    getTimeEntriesSummary(),
    getKbSummary(),
  ]);

  return `Tu es l'assistant IA intégré à Nexus, une plateforme ITSM pour MSP (fournisseurs de services gérés).
Tu aides les techniciens et agents à gérer les tickets, actifs, contacts et alertes.

CONTEXTE NEXUS:

Organisations clientes:
${orgs}

Catégories de tickets disponibles:
${categories}

Tickets récents:
${ticketsSummary}

État des sauvegardes Veeam (dernières 48h):
${veeam}

Alertes monitoring actives:
${monitoring}

Actifs:
${assets}

Contacts:
${contacts}

Temps saisi (7 derniers jours):
${timeEntries}

Base de connaissances:
${kb}

${memories ? `\n${memories}\n` : ""}
RÈGLES:
- Réponds toujours en français
- Sois concis et direct
- Si on te demande des données spécifiques que tu n'as pas, dis-le clairement
- Tu peux aider à: catégoriser des tickets, résumer des situations, chercher des infos, suggérer des actions
- Format: utilise du markdown pour la lisibilité
- MÉMOIRE: Si l'utilisateur dit "retiens que...", "souviens-toi que...", "note que...", ou toute instruction similaire, réponds avec [MEMORY_SAVE:catégorie:contenu] pour que le système sauvegarde automatiquement. Catégories possibles: client, procedure, pattern, preference, note
- Si l'utilisateur dit "oublie..." ou "supprime la mémoire...", réponds avec [MEMORY_DELETE:le contenu à supprimer]`;
}

// ---------------------------------------------------------------------------
// Category suggestion with feedback loop
// ---------------------------------------------------------------------------

export async function suggestCategory(
  subject: string,
  description: string,
): Promise<{ category: string; confidence: string; reasoning: string }> {
  const [categories, feedback] = await Promise.all([
    getCategoriesList(),
    getRecentFeedback(),
  ]);

  const feedbackSection = feedback
    ? `\n\nExemples de catégorisation confirmés par les agents:\n${feedback}`
    : "";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `Tu es un assistant de catégorisation de tickets pour un MSP.

Catégories disponibles:
${categories}
${feedbackSection}

Retourne UNIQUEMENT du JSON valide (sans markdown, sans backticks):
{"category": "Nom exact de la catégorie", "confidence": "high|medium|low", "reasoning": "Explication courte en français"}`,
    },
    {
      role: "user",
      content: `Sujet: ${subject}\nDescription: ${description || "(aucune)"}`,
    },
  ];

  const response = await chatCompletion(messages, { temperature: 0.1 });
  try {
    return JSON.parse(response);
  } catch {
    return { category: "", confidence: "low", reasoning: response };
  }
}

// ---------------------------------------------------------------------------
// Save category feedback
// ---------------------------------------------------------------------------

export async function saveCategoryFeedback(
  subject: string,
  description: string,
  suggestedCategory: string,
  confirmedCategory: string,
) {
  await prisma.aiCategoryFeedback.create({
    data: {
      subject,
      description,
      suggestedCategory,
      confirmedCategory,
      wasCorrect: suggestedCategory === confirmedCategory,
    },
  });
}
