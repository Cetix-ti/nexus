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
