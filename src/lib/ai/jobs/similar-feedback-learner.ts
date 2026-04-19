// ============================================================================
// SIMILAR FEEDBACK LEARNER — transforme les feedbacks EXPLICITES du widget
// "Tickets similaires" (thumbs-up / thumbs-down) en pénalités globales sur
// les tokens qui causent des faux positifs.
//
// Hypothèse : si un tech marque TK-A comme "pas en rapport" avec TK-B, c'est
// probablement parce que le système a matché sur un mot TROP générique qui
// apparaît dans les deux. Ex : "courriel", "microsoft", "problème"…
//
// Algorithme :
//   1. Charge tous les feedbacks verdict="bad" des 90 derniers jours.
//   2. Pour chaque paire (source, suggéré), récupère les tokens partagés
//      (après normalisation + stop-words). Ce sont les suspects.
//   3. Compte les occurrences de chaque token comme "coupable" de bad match.
//   4. Token qui apparaît dans ≥ PENALTY_THRESHOLD bad matches → ajouté à
//      AiPattern(scope="learned:similar", kind="penalty_token", key=<token>)
//      avec une force proportionnelle au nombre d'occurrences.
//   5. Le scorer lit ces pénalités via getTokenPenalties() et soustrait au
//      score quand le token est matché.
//
// Compensation : si le token a AUSSI beaucoup de "good" feedbacks, la
// pénalité est annulée (signal mixte = token légitime).
//
// Interval : 6h — feedback loop continue avec le temps d'accumuler.
// ============================================================================

import prisma from "@/lib/prisma";
import { ageWeight } from "./feedback-decay";

const LOOKBACK_DAYS = 90;
const PENALTY_THRESHOLD = 3;
const MIN_TOKEN_LENGTH = 3;

// Stop-words FR/EN de base — ne participent pas à l'apprentissage.
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "une", "des", "les", "avec", "sans", "dans", "pour", "mais", "plus",
  "tous", "tout", "avoir", "faire", "bien", "autre", "autres", "notre",
  "cela", "cette", "celle", "celui", "sous", "vers", "lors", "ceux",
]);

interface Feedback {
  sourceTicketId: string;
  suggestedTicketId: string;
  verdict: "bad" | "good";
  weight: number;
}

export async function learnFromSimilarFeedback(): Promise<{
  feedbacksAnalyzed: number;
  tokensPenalized: number;
  tokensReleased: number;
}> {
  const stats = {
    feedbacksAnalyzed: 0,
    tokensPenalized: 0,
    tokensReleased: 0,
  };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: "similar:feedback",
      kind: "pair",
      createdAt: { gte: since },
    },
    select: { value: true, createdAt: true },
  });

  const feedbacks: Feedback[] = [];
  for (const r of rows) {
    const v = r.value as Partial<Feedback> | null;
    if (
      !v ||
      typeof v.sourceTicketId !== "string" ||
      typeof v.suggestedTicketId !== "string" ||
      (v.verdict !== "bad" && v.verdict !== "good")
    ) {
      continue;
    }
    feedbacks.push({
      sourceTicketId: v.sourceTicketId,
      suggestedTicketId: v.suggestedTicketId,
      verdict: v.verdict,
      weight: ageWeight(r.createdAt),
    });
  }
  stats.feedbacksAnalyzed = feedbacks.length;
  if (feedbacks.length === 0) return stats;

  // Récupère les sujets+descriptions en batch pour extraction de tokens.
  const ticketIds = new Set<string>();
  for (const f of feedbacks) {
    ticketIds.add(f.sourceTicketId);
    ticketIds.add(f.suggestedTicketId);
  }
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: Array.from(ticketIds) } },
    select: { id: true, subject: true, description: true },
  });
  const textById = new Map(
    tickets.map((t) => [
      t.id,
      `${t.subject} ${(t.description ?? "").slice(0, 1000)}`,
    ]),
  );

  // Comptage bad/good par token, PONDÉRÉ par âge. Les feedbacks récents
  // (< 30j) comptent pour ~1, ceux proches de 90j pour ~0.1.
  const counts = new Map<string, { bad: number; good: number }>();
  for (const f of feedbacks) {
    const src = textById.get(f.sourceTicketId);
    const sug = textById.get(f.suggestedTicketId);
    if (!src || !sug) continue;
    const shared = sharedTokens(src, sug);
    for (const token of shared) {
      const cur = counts.get(token) ?? { bad: 0, good: 0 };
      if (f.verdict === "bad") cur.bad += f.weight;
      else cur.good += f.weight;
      counts.set(token, cur);
    }
  }

  // Détermine les tokens à pénaliser / libérer.
  const existing = await prisma.aiPattern.findMany({
    where: {
      scope: "learned:similar",
      kind: "penalty_token",
    },
    select: { key: true, id: true },
  });
  const existingKeys = new Set(existing.map((e) => e.key));

  const toUpsert: Array<{ token: string; bad: number; good: number }> = [];
  const toRelease: string[] = [];

  for (const [token, c] of counts) {
    if (c.bad >= PENALTY_THRESHOLD && c.bad > c.good * 2) {
      toUpsert.push({ token, bad: c.bad, good: c.good });
    } else if (existingKeys.has(token) && c.good >= c.bad) {
      // Signal majoritairement positif maintenant → libère le token.
      toRelease.push(token);
    }
  }

  for (const t of toUpsert) {
    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "learned:similar",
            kind: "penalty_token",
            key: t.token,
          },
        },
        create: {
          scope: "learned:similar",
          kind: "penalty_token",
          key: t.token,
          value: {
            token: t.token,
            badCount: t.bad,
            goodCount: t.good,
            penaltyStrength: Math.min(1, t.bad / 10),
            learnedAt: new Date().toISOString(),
          } as never,
          sampleCount: t.bad + t.good,
          confidence: Math.min(1, t.bad / 10),
        },
        update: {
          value: {
            token: t.token,
            badCount: t.bad,
            goodCount: t.good,
            penaltyStrength: Math.min(1, t.bad / 10),
            learnedAt: new Date().toISOString(),
          } as never,
          sampleCount: t.bad + t.good,
          confidence: Math.min(1, t.bad / 10),
        },
      });
      stats.tokensPenalized++;
    } catch (err) {
      console.warn(`[similar-feedback] upsert ${t.token} failed:`, err);
    }
  }

  if (toRelease.length > 0) {
    await prisma.aiPattern.deleteMany({
      where: {
        scope: "learned:similar",
        kind: "penalty_token",
        key: { in: toRelease },
      },
    });
    stats.tokensReleased = toRelease.length;
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sharedTokens(a: string, b: string): Set<string> {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  const out = new Set<string>();
  for (const t of tokA) if (tokB.has(t)) out.add(t);
  return out;
}

function tokenize(text: string): Set<string> {
  const norm = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  const tokens = new Set<string>();
  for (const w of norm.split(/\s+/)) {
    if (w.length < MIN_TOKEN_LENGTH) continue;
    if (STOP_WORDS.has(w)) continue;
    tokens.add(w);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Helper public — consommé par le scorer des tickets similaires. Cache 10 min.
// ---------------------------------------------------------------------------

interface PenaltyCache {
  at: number;
  map: Map<string, number>; // token → penaltyStrength (0-1)
}
let penaltyCache: PenaltyCache = { at: 0, map: new Map() };
const CACHE_TTL_MS = 10 * 60_000;

export async function getTokenPenalties(): Promise<Map<string, number>> {
  if (Date.now() - penaltyCache.at < CACHE_TTL_MS) {
    return penaltyCache.map;
  }
  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: "learned:similar",
      kind: "penalty_token",
    },
    select: { key: true, value: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = r.value as { penaltyStrength?: number } | null;
    if (v && typeof v.penaltyStrength === "number") {
      map.set(r.key, v.penaltyStrength);
    }
  }
  penaltyCache = { at: Date.now(), map };
  return map;
}
