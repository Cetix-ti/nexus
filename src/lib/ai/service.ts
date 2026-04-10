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
// Build the system prompt with Nexus context
// ---------------------------------------------------------------------------

export async function buildSystemPrompt(): Promise<string> {
  const [ticketsSummary, categories, orgs] = await Promise.all([
    getRecentTicketsSummary(),
    getCategoriesList(),
    getOrgsSummary(),
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

RÈGLES:
- Réponds toujours en français
- Sois concis et direct
- Si on te demande des données spécifiques que tu n'as pas, dis-le clairement
- Tu peux aider à: catégoriser des tickets, résumer des situations, chercher des infos, suggérer des actions
- Format: utilise du markdown pour la lisibilité`;
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
