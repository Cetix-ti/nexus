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
      max_tokens: options?.maxTokens ?? 4096,
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
type QueryIntent = "tickets" | "backups" | "monitoring" | "contacts" | "assets" | "kb" | "time" | "finance" | "general";

/** Detect what the user is asking about — scored intent detection */
function detectIntents(message: string): QueryIntent[] {
  const m = message.toLowerCase();
  const scores: Record<QueryIntent, number> = {
    tickets: 0, backups: 0, monitoring: 0, contacts: 0,
    assets: 0, kb: 0, time: 0, finance: 0, general: 0,
  };

  // Ticket patterns (high confidence)
  if (/ticket|billet/.test(m)) scores.tickets += 3;
  if (/incident|demande de service|problème|requête/.test(m)) scores.tickets += 2;
  if (/bug|erreur|panne|dysfonction|ne fonctionne|planté|crashe|lent/.test(m)) scores.tickets += 2;
  if (/créé|ouvert|fermé|résolu|assigné|en cours|en attente/.test(m)) scores.tickets += 1;
  if (/sla|dépassé|retard|urgent|priorité|critique/.test(m)) scores.tickets += 1;

  // Backup patterns
  if (/sauvegarde|backup|veeam/.test(m)) scores.backups += 3;
  if (/bkp|restaur|récupér|disaster|reprise/.test(m)) scores.backups += 2;
  if (/réplicat|snapshot|rétention/.test(m)) scores.backups += 1;

  // Monitoring patterns
  if (/monitoring|alerte|zabbix|atera|fortigate|wazuh|bitdefender/.test(m)) scores.monitoring += 3;
  if (/surveillance|notification|capteur|sonde|triage/.test(m)) scores.monitoring += 2;
  if (/cpu|mémoire|disque|espace|threshold|seuil|ping|down/.test(m)) scores.monitoring += 1;

  // Contact patterns
  if (/contact|qui est|coordonnées/.test(m)) scores.contacts += 3;
  if (/utilisateur|client|employé|personne|responsable/.test(m)) scores.contacts += 2;
  if (/email|courriel|téléphone|poste|adresse/.test(m)) scores.contacts += 1;

  // Asset patterns
  if (/actif|asset|inventaire/.test(m)) scores.assets += 3;
  if (/serveur|poste|équipement|matériel|ordinateur|laptop|imprimante/.test(m)) scores.assets += 2;
  if (/switch|routeur|firewall|ups|nas|san|vm|machine virtuelle/.test(m)) scores.assets += 2;
  if (/ip|adresse ip|sériee|modèle|fabricant|garantie|fin de vie|eol/.test(m)) scores.assets += 1;

  // KB patterns
  if (/article|documentation|procédure|base de connaissance|kb|wiki/.test(m)) scores.kb += 3;
  if (/comment faire|guide|tutoriel|aide|instruction/.test(m)) scores.kb += 2;
  if (/étapes|configurer|installer|dépanner/.test(m)) scores.kb += 1;

  // Time entry patterns
  if (/temps|heure|facturable|saisie|timesheet/.test(m)) scores.time += 3;
  if (/heures travaillées|banque d'heures|overtime/.test(m)) scores.time += 2;

  // Finance patterns
  if (/factur|dépense|expense|contrat/.test(m)) scores.finance += 3;
  if (/coût|revenu|financ|argent|dollar|budget|montant|tarif/.test(m)) scores.finance += 2;
  if (/bon de commande|purchase order|po|devis/.test(m)) scores.finance += 1;

  // Build intent list from scores (threshold: 1+)
  const intents: QueryIntent[] = [];
  for (const [intent, score] of Object.entries(scores)) {
    if (score >= 1 && intent !== "general") {
      intents.push(intent as QueryIntent);
    }
  }

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

  // "depuis janvier", "depuis février", etc.
  const monthNames: Record<string, number> = {
    janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11,
  };

  const depuisMatch = m.match(/depuis\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)/);
  if (depuisMatch) {
    const monthNum = monthNames[depuisMatch[1]];
    const year = monthNum <= now.getMonth() ? now.getFullYear() : now.getFullYear() - 1;
    return { since: new Date(year, monthNum, 1), label: `depuis ${depuisMatch[1]}` };
  }

  // "en mars", "en janvier", etc. — treat as a specific month range
  const enMoisMatch = m.match(/en\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)/);
  if (enMoisMatch) {
    const monthNum = monthNames[enMoisMatch[1]];
    const year = monthNum <= now.getMonth() ? now.getFullYear() : now.getFullYear() - 1;
    return { since: new Date(year, monthNum, 1), label: `en ${enMoisMatch[1]}` };
  }

  // "cette année" / "this year"
  if (/cette année|this year/.test(m)) {
    return { since: new Date(now.getFullYear(), 0, 1), label: "cette année" };
  }

  return null;
}

/** Detect organization names mentioned in the query */
async function detectOrgNames(message: string): Promise<string[]> {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { name: true },
    take: 500,
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

  // Deduplicate tickets by id (can appear multiple times when matching multiple OR conditions)
  const seen = new Set<string>();
  const uniqueTickets = tickets.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  // Relevance scoring: exact match in subject > partial in subject > description > comments
  const scored = uniqueTickets.map((t) => {
    let score = 0;
    const subjectLower = t.subject.toLowerCase();
    const descLower = t.description.toLowerCase();
    const commentsText = t.comments.map((c) => c.body.toLowerCase()).join(" ");
    for (const term of terms) {
      const tl = term.toLowerCase();
      if (subjectLower === tl) score += 100;            // exact match in subject
      else if (subjectLower.includes(tl)) score += 50;  // partial match in subject
      if (descLower.includes(tl)) score += 20;          // match in description
      if (commentsText.includes(tl)) score += 10;       // match in comments
    }
    return { ticket: t, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Structured formatting for better AI comprehension
  return scored.map(({ ticket: t, score }) => {
    const commentSnippets = t.comments
      .map((c) => c.body.slice(0, 150).replace(/\n/g, " "))
      .filter(Boolean);
    const commentSection = commentSnippets.length > 0
      ? `\n    Derniers commentaires: ${commentSnippets.join(" | ")}`
      : "";
    const descSnippet = t.description.slice(0, 250).replace(/\n/g, " ");
    return [
      `• INC-${1000 + t.number} [score:${score}] — ${t.subject}`,
      `    Statut: ${t.status} | Priorité: ${t.priority} | Client: ${t.organization?.name ?? "?"}`,
      `    Demandeur: ${t.requester ? `${t.requester.firstName} ${t.requester.lastName}` : "?"} | Assigné: ${t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Non assigné"}`,
      `    Date: ${t.createdAt.toLocaleDateString("fr-CA")}`,
      `    Description: ${descSnippet}`,
      commentSection,
    ].filter(Boolean).join("\n");
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
    { tags: { has: term } },
  ]);

  const articles = await prisma.article.findMany({
    where: { OR: orConditions, status: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { title: true, summary: true, body: true },
  });

  if (articles.length === 0) return "";

  // Deduplicate articles by title (in case multiple terms match the same article)
  const seen = new Set<string>();
  const uniqueArticles = articles.filter((a) => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });

  return uniqueArticles.map((a) =>
    `• ${a.title}\n    ${(a.summary || a.body).slice(0, 250).replace(/\n/g, " ")}`,
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

  // Deduplicate contacts by id
  const seen = new Set<string>();
  const uniqueContacts = contacts.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return uniqueContacts.map((c) =>
    `• ${c.firstName} ${c.lastName} (${c.email}) — ${c.organization?.name ?? "?"} — ${c.jobTitle ?? ""} — ${c.isActive ? "Actif" : "Inactif"}`,
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

  /** Wrap a search so that individual failures are caught and don't break everything */
  function safeSearch(label: string, fn: () => Promise<string>): Promise<[string, string]> {
    return fn().then((r) => [label, r] as [string, string]).catch((err) => {
      console.error(`RAG search failed for ${label}:`, err);
      return [label, ""] as [string, string];
    });
  }

  // Route searches based on detected intents
  if (isGeneral || intents.includes("tickets")) {
    searches.push(safeSearch("TICKETS TROUVÉS", () => searchTickets(userMessage, dateRange, orgNames)));
  }
  if (isGeneral || intents.includes("backups")) {
    searches.push(safeSearch("ALERTES VEEAM", () => searchVeeamAlerts(userMessage, dateRange, orgNames)));
  }
  if (isGeneral || intents.includes("monitoring")) {
    searches.push(safeSearch("ALERTES MONITORING", () => searchMonitoringAlerts(userMessage, dateRange, orgNames)));
  }
  if (isGeneral || intents.includes("kb")) {
    searches.push(safeSearch("ARTICLES KB", () => searchKbArticles(userMessage)));
  }
  if (isGeneral || intents.includes("contacts")) {
    searches.push(safeSearch("CONTACTS", () => searchContacts(userMessage)));
  }
  if (isGeneral || intents.includes("assets")) {
    searches.push(safeSearch("ACTIFS", () => searchAssets(userMessage, orgNames)));
  }
  if (intents.includes("time")) {
    searches.push(safeSearch("SAISIES DE TEMPS", () => searchTimeEntries(dateRange, orgNames)));
  }

  const results = await Promise.all(searches);
  const populated = results.filter(([, data]) => data.length > 0);

  if (populated.length === 0) return "";

  const sections = populated.map(([label, data]) => `── ${label} ──\n${data}`);

  const contextInfo: string[] = [];
  if (dateRange) contextInfo.push(`Période: ${dateRange.label}`);
  if (orgNames.length > 0) contextInfo.push(`Client(s): ${orgNames.join(", ")}`);
  const contextHeader = contextInfo.length > 0 ? `[Filtres: ${contextInfo.join(" | ")}]\n` : "";
  const summary = `${populated.length} source(s) consultée(s): ${populated.map(([l]) => l).join(", ")}`;

  return `\n\nRÉSULTATS DE RECHERCHE:\n${contextHeader}${summary}\n\n${sections.join("\n\n")}`;
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
  // Get top 20 most-used categories by ticket count, then fill with remaining active ones
  const topCats = await prisma.category.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { tickets: true } },
      children: {
        where: { isActive: true },
        include: {
          _count: { select: { tickets: true } },
          children: { where: { isActive: true }, include: { _count: { select: { tickets: true } } } },
        },
        take: 10,
      },
    },
    orderBy: { sortOrder: "asc" },
    take: 50,
  });

  const roots = topCats.filter((c) => !c.parentId);

  // Flatten all categories with their full paths and ticket counts
  const allPaths: { path: string; count: number }[] = [];
  for (const r of roots) {
    const rCount = (r._count as any)?.tickets ?? 0;
    allPaths.push({ path: r.name, count: rCount });
    for (const c of r.children ?? []) {
      const cCount = (c._count as any)?.tickets ?? 0;
      allPaths.push({ path: `${r.name} > ${c.name}`, count: cCount });
      for (const gc of (c as any).children ?? []) {
        const gcCount = (gc._count as any)?.tickets ?? 0;
        allPaths.push({ path: `${r.name} > ${c.name} > ${gc.name}`, count: gcCount });
      }
    }
  }

  // Sort by usage count descending and take top 20
  allPaths.sort((a, b) => b.count - a.count);
  const top = allPaths.slice(0, 20);

  if (top.length === 0) return "Matériel, Logiciels, Réseau & VPN, Compte & Accès, Email, Sécurité";
  return top.map((c) => `- ${c.path}`).join("\n");
}

async function getOrgsSummary(): Promise<string> {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { name: true, domain: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  const names = orgs.map((o) => o.name).join(", ");
  const total = await prisma.organization.count({ where: { isActive: true } });
  return total > 20 ? `${names} (+${total - 20} autres)` : names;
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
    take: 500,
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
  // Deduplicate: check if a very similar memory already exists
  const existing = await prisma.aiMemory.findFirst({
    where: {
      scope,
      category,
      content: { contains: content.slice(0, 50), mode: "insensitive" },
    },
  });
  if (existing) {
    // Update existing memory instead of creating a duplicate
    await prisma.aiMemory.update({
      where: { id: existing.id },
      data: { content, source, updatedAt: new Date() },
    });
    return;
  }
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

  // Build concise context sections — only include non-empty ones
  const sections: string[] = [];

  sections.push(`Clients: ${orgs}`);
  sections.push(`Catégories (top 20): \n${categories}`);
  sections.push(`Tickets récents:\n${ticketsSummary}`);
  if (veeam && !veeam.startsWith("Aucune")) sections.push(`Sauvegardes Veeam (48h):\n${veeam}`);
  if (monitoring && !monitoring.startsWith("Aucune")) sections.push(`Alertes monitoring:\n${monitoring}`);
  sections.push(`Actifs: ${assets}`);
  sections.push(`Contacts: ${contacts}`);
  sections.push(`Temps (7j): ${timeEntries}`);
  sections.push(`KB: ${kb}`);

  const contextBlock = sections.join("\n\n");

  return `Tu es l'assistant IA de Nexus, une plateforme ITSM conçue pour les MSP (fournisseurs de services gérés). Tu assistes les techniciens et gestionnaires dans la gestion des tickets, actifs, contacts, alertes monitoring, sauvegardes, temps et facturation.

CONTEXTE TEMPS RÉEL:
${contextBlock}
${memories ? `\n${memories}\n` : ""}
CAPACITÉS:
- Rechercher et résumer des tickets, contacts, actifs, alertes monitoring, sauvegardes Veeam, saisies de temps
- Catégoriser des tickets automatiquement et suggérer des actions
- Analyser des tendances (volume, SLA, performance des techniciens)
- Répondre à des questions sur les procédures internes (base de connaissances)
- Calculer des statistiques de facturation et de banque d'heures
- Identifier les problèmes récurrents et les clients à risque

RÈGLES:
1. Réponds TOUJOURS en français (sauf si l'utilisateur parle en anglais)
2. Sois concis et structuré — utilise du markdown (titres, listes, gras)
3. Quand tu cites des tickets, utilise le format **INC-XXXX** avec le sujet
4. Quand tu cites des dates, utilise le format "12 avril 2026" (pas ISO)
5. Si tu ne trouves pas l'info, dis-le clairement plutôt que d'inventer
6. Pour les statistiques, donne des chiffres précis tirés des données fournies
7. Priorise les informations les plus récentes et pertinentes

MÉMOIRE PERSISTANTE:
- Pour sauvegarder: [MEMORY_SAVE:catégorie:contenu] (catégories: client, procedure, pattern, preference, note)
- Pour supprimer: [MEMORY_DELETE:contenu]
- Déclenché par: "retiens", "souviens-toi", "note que", "oublie", "supprime de ta mémoire"`;
}

// ---------------------------------------------------------------------------
// Category suggestion with feedback loop
// ---------------------------------------------------------------------------

export interface CategorySuggestion {
  /** Niveau 1 obligatoire. Catégorie racine. */
  categoryLevel1: string;
  /** Niveau 2 : sous-catégorie sous level1. Vide si non applicable. */
  categoryLevel2?: string;
  /** Niveau 3 : item sous level2. Vide si non applicable. */
  categoryLevel3?: string;
  /** Nom de la catégorie la plus PROFONDE choisie. Dérivé des 3 levels. */
  category: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

// ----------------------------------------------------------------------------
// PRIORITY SUGGESTION — analyse IA pour positionner la priorité d'un ticket
// ----------------------------------------------------------------------------

export type AiPriority = "critical" | "high" | "medium" | "low";

export interface PrioritySuggestion {
  /** Priorité suggérée par l'IA. */
  priority: AiPriority;
  /** Niveau de confiance — seul "high" déclenche une mise à jour. */
  confidence: "high" | "medium" | "low";
  /** Explication courte (1 phrase) en français. */
  reasoning: string;
}

/**
 * Analyse le sujet + la description d'un ticket et renvoie une priorité
 * suggérée. L'objectif est strict : on ne doit PAS sur-prioriser. L'IA
 * doit défaut à `low` sauf preuve contraire (mots-clés d'urgence explicites,
 * impact multi-utilisateurs, sécurité, production down, etc.).
 *
 * Ne throw jamais — en cas d'erreur réseau/clé absente, renvoie une
 * suggestion `low` + `confidence: low` pour que l'appelant n'écrase rien.
 */
export async function suggestPriority(
  subject: string,
  description: string,
): Promise<PrioritySuggestion> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `Tu es un analyste de priorité pour les tickets d'un MSP (support IT).

Tu dois classifier la priorité du ticket sur 4 niveaux :
- "critical" : production down, sécurité compromise, perte de données, plusieurs utilisateurs bloqués.
- "high"     : un utilisateur clé ou un service important ne fonctionne plus ; blocage du travail.
- "medium"   : gêne réelle mais contournement possible, demande à traiter dans la journée.
- "low"      : demande standard, question, demande de configuration, pas de blocage.

Règles ABSOLUES :
1. Par défaut, priorité = "low". N'élève la priorité que si tu as des signaux CLAIRS.
2. Si le texte est court, vague, ou ambigu → confidence = "low" et priority = "low".
3. Si tu n'es PAS sûr → confidence = "low". Mieux vaut sous-prioriser et laisser l'agent élever que faire paniquer l'équipe.
4. Réserve "critical" aux vraies pannes. Réserve "high" aux blocages individuels avec mention d'impact.
5. confidence = "high" uniquement si les indices sont explicites et non ambigus (ex: "production down", "serveur inaccessible", "équipe entière bloquée", "virus", "rançongiciel").

Retourne UNIQUEMENT du JSON valide (sans markdown, sans backticks) :
{
  "priority": "critical|high|medium|low",
  "confidence": "high|medium|low",
  "reasoning": "Explication courte en français (1 phrase)"
}`,
    },
    {
      role: "user",
      content: `Sujet: ${subject}\nDescription: ${description || "(aucune)"}`,
    },
  ];

  try {
    const response = await chatCompletion(messages, { temperature: 0.1 });
    const parsed = JSON.parse(response) as Partial<PrioritySuggestion>;
    const priority = (parsed.priority || "low") as AiPriority;
    const confidence = (parsed.confidence || "low") as PrioritySuggestion["confidence"];
    const valid: AiPriority[] = ["critical", "high", "medium", "low"];
    return {
      priority: valid.includes(priority) ? priority : "low",
      confidence: ["high", "medium", "low"].includes(confidence) ? confidence : "low",
      reasoning: parsed.reasoning || "",
    };
  } catch (e) {
    return {
      priority: "low",
      confidence: "low",
      reasoning: e instanceof Error ? `Erreur IA : ${e.message}` : "Erreur IA",
    };
  }
}

export async function suggestCategory(
  subject: string,
  description: string,
): Promise<CategorySuggestion> {
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

Catégories disponibles (format hiérarchique "Niveau1 > Niveau2 > Niveau3") :
${categories}
${feedbackSection}

Règles :
1. Choisis la catégorie la PLUS PROFONDE applicable (niveau 3 > niveau 2 > niveau 1).
2. Si aucune sous-catégorie ne matche, reste à un niveau supérieur (level2 seul ou level1 seul).
3. N'invente PAS de catégorie qui n'est pas dans la liste.
4. Les noms retournés doivent être EXACTS (casse, accents, espaces).

Retourne UNIQUEMENT du JSON valide (sans markdown, sans backticks) :
{
  "categoryLevel1": "Nom exact du niveau 1",
  "categoryLevel2": "Nom exact du niveau 2 (ou chaîne vide si N/A)",
  "categoryLevel3": "Nom exact du niveau 3 (ou chaîne vide si N/A)",
  "confidence": "high|medium|low",
  "reasoning": "Explication courte en français (1 phrase)"
}`,
    },
    {
      role: "user",
      content: `Sujet: ${subject}\nDescription: ${description || "(aucune)"}`,
    },
  ];

  const response = await chatCompletion(messages, { temperature: 0.1 });
  try {
    const parsed = JSON.parse(response) as Partial<CategorySuggestion> & {
      // Back-compat : l'ancien prompt renvoyait `category` seul. Si un
      // appelant externe garde l'ancien shape, on le traite aussi.
      category?: string;
    };
    const l1 = (parsed.categoryLevel1 || "").trim();
    const l2 = (parsed.categoryLevel2 || "").trim();
    const l3 = (parsed.categoryLevel3 || "").trim();
    // La "category" effective = la plus profonde non-vide. Utilisée
    // par le feedback loop + le code legacy qui ne connaît qu'un
    // niveau. Fallback vers le vieux champ `category` si présent (vieux
    // modèle qui aurait renvoyé que `category`).
    const effective = l3 || l2 || l1 || parsed.category || "";
    return {
      categoryLevel1: l1 || parsed.category || "",
      categoryLevel2: l2 || undefined,
      categoryLevel3: l3 || undefined,
      category: effective,
      confidence: (parsed.confidence as CategorySuggestion["confidence"]) || "low",
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return {
      categoryLevel1: "",
      category: "",
      confidence: "low",
      reasoning: response,
    };
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

// ---------------------------------------------------------------------------
// Audit IA des catégories existantes
// ---------------------------------------------------------------------------

export interface CategoryAuditSuggestion {
  /** "add" → nouvelle catégorie à créer. "rehome" → déplacer. "rename" → renommer. */
  kind: "add" | "rehome" | "rename";
  /** Chemin actuel (pour rehome/rename) ou chemin proposé (pour add). */
  path: string;
  /** Si kind=rehome ou rename : chemin proposé. */
  proposedPath?: string;
  /** Explication courte en français. */
  reason: string;
}

export interface CategoryAuditReport {
  summary: string;
  suggestions: CategoryAuditSuggestion[];
  generatedAt: string;
}

/**
 * Demande à l'IA d'auditer la hiérarchie actuelle de catégories.
 *
 * On lui fournit :
 *   1. La hiérarchie complète avec compteur de tickets par nœud
 *   2. Un échantillon de tickets récents (subject + categoryName)
 *   3. Les feedback de catégorisation récents (suggestion vs
 *      confirmation) — permet de détecter les désaccords systématiques
 *      qui signalent un trou dans la taxonomie
 *
 * Retourne un rapport structuré : liste de suggestions d'ajout /
 * rehoming / renommage. L'utilisateur applique manuellement (on ne
 * mute PAS la DB automatiquement — trop risqué pour l'arborescence).
 */
export async function auditCategoryTaxonomy(): Promise<CategoryAuditReport> {
  // 1. Hiérarchie complète avec compteurs
  const cats = await prisma.category.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: { select: { tickets: true } },
    },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
  });
  const byId = new Map(cats.map((c) => [c.id, c]));
  function fullPath(c: (typeof cats)[number]): string {
    const chain: string[] = [c.name];
    let cursor = c.parentId ? byId.get(c.parentId) : undefined;
    while (cursor) {
      chain.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return chain.join(" > ");
  }
  const hierarchyText = cats
    .map((c) => `- ${fullPath(c)} (${(c._count as { tickets: number }).tickets} tickets)`)
    .join("\n");

  // 2. Échantillon de tickets récents (pour voir les patterns réels)
  const recent = await prisma.ticket.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      subject: true,
      category: { select: { name: true } },
    },
  });
  const ticketsText = recent
    .map((t) => `- "${t.subject.slice(0, 80)}" → ${t.category?.name ?? "(sans catégorie)"}`)
    .join("\n");

  // 3. Feedbacks récents (désaccords)
  const feedback = await prisma.aiCategoryFeedback.findMany({
    where: { wasCorrect: false },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { subject: true, suggestedCategory: true, confirmedCategory: true },
  });
  const feedbackText = feedback.length > 0
    ? feedback
        .map(
          (f) =>
            `- "${f.subject.slice(0, 60)}" : IA voulait "${f.suggestedCategory}", agent a choisi "${f.confirmedCategory}"`,
        )
        .join("\n")
    : "(aucun désaccord récent)";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `Tu es un consultant en architecture de support IT pour un MSP.
Analyse la taxonomie actuelle des catégories de tickets et propose des
améliorations concrètes. Concentre-toi sur :
  - catégories MANQUANTES (issues fréquentes sans nœud dédié)
  - catégories MAL HIÉRARCHISÉES (ex: "Réseau" devrait être sous
    "Infrastructure" plutôt qu'à la racine)
  - catégories à RENOMMER pour clarté

IMPORTANT :
  - Reste pragmatique. Ne propose pas plus de 8 suggestions.
  - Ne duplique PAS une catégorie qui existe déjà sous un autre chemin.
  - Si tout est déjà bien organisé, renvoie une liste vide + un
    summary positif.

Retourne UNIQUEMENT du JSON valide (sans markdown) :
{
  "summary": "Résumé en 1-2 phrases de l'état général",
  "suggestions": [
    {
      "kind": "add" | "rehome" | "rename",
      "path": "Chemin actuel OU chemin proposé si kind=add",
      "proposedPath": "Chemin proposé (uniquement pour rehome/rename)",
      "reason": "Explication courte en français"
    }
  ]
}`,
    },
    {
      role: "user",
      content: `Hiérarchie actuelle (${cats.length} catégories) :
${hierarchyText}

Échantillon de 60 tickets récents et leur catégorie :
${ticketsText}

Désaccords récents IA vs agent (catégorisations corrigées) :
${feedbackText}`,
    },
  ];

  const response = await chatCompletion(messages, { temperature: 0.3 });
  try {
    const parsed = JSON.parse(response) as Omit<CategoryAuditReport, "generatedAt">;
    return {
      summary: parsed.summary || "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      summary: "Impossible de parser la réponse IA.",
      suggestions: [],
      generatedAt: new Date().toISOString(),
    };
  }
}
