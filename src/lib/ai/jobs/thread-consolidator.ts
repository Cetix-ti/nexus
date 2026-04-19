// ============================================================================
// THREAD CONSOLIDATOR — résume les longs fils de tickets en un récap
// structuré que tout tech peut lire en 15 secondes.
//
// Problème : les tickets longs (> 8 commentaires) obligent les techs à
// scroller pendant 5-10 minutes avant de comprendre l'état réel. Pire
// quand un ticket est passé de main en main — personne ne lit toute
// l'histoire, les mêmes questions reviennent au client, frustration des
// deux côtés.
//
// Solution : un job en arrière-plan qui détecte les fils éligibles et
// produit 4 sections structurées via LLM :
//   - situation        : "où en est-on concrètement ?"
//   - decisionsTaken   : bullet list des décisions déjà prises
//   - attemptedFixes   : ce qui a été essayé (avec verdict succès/échec)
//   - openQuestions    : ce qui attend encore une réponse
//
// Cache contrôlé par un hash du thread (count + dernier comment timestamp).
// Le consolidé n'est régénéré que quand le thread GROSSIT, pas à chaque
// tick du job. Coût LLM maîtrisé.
//
// Stockage : AiPattern(scope="thread:recap", kind="ticket", key=<ticketId>).
// Helper `getThreadRecap(ticketId)` consommé par un widget sur la page ticket.
// ============================================================================

import prisma from "@/lib/prisma";
import { createHash } from "crypto";
import { runAiTask, tryParseJson } from "@/lib/ai/orchestrator";
import { POLICY_ESCALATION_BRIEF } from "@/lib/ai/orchestrator/policies";

const MIN_COMMENTS_TO_CONSOLIDATE = 8;
const MAX_TICKETS_PER_RUN = 20;
const LOOKBACK_DAYS = 30;
const MAX_BODY_PER_COMMENT = 800;

interface ThreadRecap {
  ticketId: string;
  commentCount: number;
  threadHash: string;
  situation: string;          // 2-3 phrases où en est-on
  decisionsTaken: string[];   // bullet list
  attemptedFixes: Array<{ fix: string; outcome: "success" | "failure" | "pending" }>;
  openQuestions: string[];
  participantRoles: string[]; // "client" | "tech:N1" | "tech:N2" | "manager" etc.
  lastConsolidatedAt: string;
}

export async function consolidateLongThreads(): Promise<{
  ticketsScanned: number;
  recapsWritten: number;
  skippedCached: number;
  failed: number;
}> {
  const stats = {
    ticketsScanned: 0,
    recapsWritten: 0,
    skippedCached: 0,
    failed: 0,
  };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  // Candidats : tickets non résolus avec ≥ MIN_COMMENTS commentaires (ou
  // résolus récents encore consultés). GroupBy count sur comments.
  const grouped = await prisma.comment.groupBy({
    by: ["ticketId"],
    where: { createdAt: { gte: since } },
    _count: { id: true },
    having: { id: { _count: { gte: MIN_COMMENTS_TO_CONSOLIDATE } } },
    orderBy: { _count: { id: "desc" } },
    take: MAX_TICKETS_PER_RUN * 3,
  });
  if (grouped.length === 0) return stats;

  stats.ticketsScanned = grouped.length;

  // Charge les recaps existants pour voir lesquels sont stale.
  const ticketIds = grouped.map((g) => g.ticketId);
  const existingRecaps = await prisma.aiPattern.findMany({
    where: {
      scope: "thread:recap",
      kind: "ticket",
      key: { in: ticketIds },
    },
    select: { key: true, value: true },
  });
  const existingByTicket = new Map<string, ThreadRecap>();
  for (const r of existingRecaps) {
    const v = r.value as Partial<ThreadRecap> | null;
    if (v && typeof v.threadHash === "string") {
      existingByTicket.set(r.key, v as ThreadRecap);
    }
  }

  let processed = 0;
  for (const g of grouped) {
    if (processed >= MAX_TICKETS_PER_RUN) break;
    const ticketId = g.ticketId;

    // Calcule le hash actuel du thread (count + ts dernier comment).
    const lastComment = await prisma.comment.findFirst({
      where: { ticketId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, id: true },
    });
    if (!lastComment) continue;
    const threadHash = createHash("sha256")
      .update(`${g._count.id}|${lastComment.createdAt.toISOString()}`)
      .digest("hex")
      .slice(0, 16);

    const existing = existingByTicket.get(ticketId);
    if (existing?.threadHash === threadHash) {
      stats.skippedCached++;
      continue;
    }

    const recap = await buildRecap(ticketId, threadHash);
    if (!recap) {
      stats.failed++;
      continue;
    }

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "thread:recap",
            kind: "ticket",
            key: ticketId,
          },
        },
        create: {
          scope: "thread:recap",
          kind: "ticket",
          key: ticketId,
          value: recap as never,
          sampleCount: recap.commentCount,
          confidence: 1,
        },
        update: {
          value: recap as never,
          sampleCount: recap.commentCount,
        },
      });
      stats.recapsWritten++;
      processed++;
    } catch (err) {
      console.warn(`[thread-consolidator] upsert failed for ${ticketId}:`, err);
      stats.failed++;
    }
  }

  return stats;
}

async function buildRecap(
  ticketId: string,
  threadHash: string,
): Promise<ThreadRecap | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subject: true,
      description: true,
      status: true,
    },
  });
  if (!ticket) return null;

  const comments = await prisma.comment.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      body: true,
      isInternal: true,
      source: true,
      author: {
        select: { firstName: true, lastName: true, email: true, role: true },
      },
    },
  });
  if (comments.length < MIN_COMMENTS_TO_CONSOLIDATE) return null;

  const participantRoles = Array.from(
    new Set(
      comments
        .map((c) => (c.author?.role ? String(c.author.role) : null))
        .filter((r): r is string => typeof r === "string" && r.length > 0),
    ),
  );

  // Transcription compacte — on tronque chaque commentaire pour garder le
  // prompt raisonnable même sur des fils de 50 messages.
  const transcript = comments
    .map((c, i) => {
      const who = `${c.author?.firstName ?? ""} ${c.author?.lastName ?? ""}`.trim() || c.author?.email || "?";
      const role = c.author?.role ?? "unknown";
      const tag = c.isInternal ? "[interne]" : "[client-visible]";
      const body = (c.body ?? "").replace(/\s+/g, " ").slice(0, MAX_BODY_PER_COMMENT);
      return `#${i + 1} ${tag} ${who} (${role}) — ${body}`;
    })
    .join("\n");

  const system = `Tu es un copilote ITSM. Un ticket a accumulé beaucoup d'échanges. Ta mission : produire un RÉCAP STRUCTURÉ qu'un tech entrant peut lire en 15 secondes pour comprendre l'état.

Réponds en JSON strict (zéro markdown) :
{
  "situation": "2-3 phrases factuelles sur l'état actuel",
  "decisionsTaken": ["décision 1", "décision 2"],
  "attemptedFixes": [
    { "fix": "action essayée", "outcome": "success" | "failure" | "pending" }
  ],
  "openQuestions": ["question en suspens 1"]
}

Consignes :
- Ton : neutre, professionnel. Pas de "nous", dis "le tech" ou "le client".
- situation : FAITS seulement — où en est-on concrètement ?
- decisionsTaken : actions acceptées/validées, max 6 bullets.
- attemptedFixes : TOUT ce qui a été essayé techniquement avec son verdict. max 8.
- openQuestions : ce qui bloque / attend réponse. max 5.
- Jamais de doublon. Jamais de conjectures.`;

  const user = `# TICKET
Sujet : ${ticket.subject}
Statut courant : ${ticket.status}
Description initiale : ${(ticket.description ?? "").slice(0, 1500)}

# TRANSCRIPT (${comments.length} commentaires)
${transcript}

Résume-le maintenant.`;

  const res = await runAiTask({
    policy: POLICY_ESCALATION_BRIEF,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: "generation",
  });
  if (!res.ok || !res.content) return null;
  const parsed = tryParseJson<{
    situation?: string;
    decisionsTaken?: unknown;
    attemptedFixes?: unknown;
    openQuestions?: unknown;
  }>(res.content);
  if (!parsed) return null;

  const situation =
    typeof parsed.situation === "string" ? parsed.situation.slice(0, 600) : "";
  if (!situation) return null;

  const decisionsTaken = Array.isArray(parsed.decisionsTaken)
    ? parsed.decisionsTaken
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((s) => s.slice(0, 200))
        .slice(0, 6)
    : [];

  const attemptedFixes = Array.isArray(parsed.attemptedFixes)
    ? parsed.attemptedFixes
        .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
        .map((x) => ({
          fix:
            typeof x.fix === "string"
              ? x.fix.slice(0, 200)
              : "",
          outcome:
            x.outcome === "success" || x.outcome === "failure" || x.outcome === "pending"
              ? (x.outcome as "success" | "failure" | "pending")
              : "pending",
        }))
        .filter((x) => x.fix.length > 0)
        .slice(0, 8)
    : [];

  const openQuestions = Array.isArray(parsed.openQuestions)
    ? parsed.openQuestions
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((s) => s.slice(0, 200))
        .slice(0, 5)
    : [];

  return {
    ticketId,
    commentCount: comments.length,
    threadHash,
    situation,
    decisionsTaken,
    attemptedFixes,
    openQuestions,
    participantRoles,
    lastConsolidatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helper public — consommé par le widget "Récap du fil" sur la page ticket.
// ---------------------------------------------------------------------------

export async function getThreadRecap(ticketId: string): Promise<ThreadRecap | null> {
  const row = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: "thread:recap",
        kind: "ticket",
        key: ticketId,
      },
    },
    select: { value: true },
  });
  if (!row) return null;
  const v = row.value as Partial<ThreadRecap> | null;
  if (!v || typeof v.situation !== "string") return null;
  return v as ThreadRecap;
}
