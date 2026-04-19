// ============================================================================
// CATEGORY FEEDBACK LEARNER — transforme les thumbs-up/down sur les
// suggestions de catégorie (triage IA) en pénalités applicables par le
// modèle au prochain triage.
//
// Hypothèse : si un tech marque "mauvaise catégorie" pour un ticket X avec
// la suggestion C, ce sont les TOKENS partagés entre le ticket X et la
// description représentative de C qui ont mal orienté le modèle. On les
// pénalise globalement pour CETTE catégorie (pas pour d'autres).
//
// Stockage :
//   - scope="learned:category_suggest"
//   - kind="avoid_token_for_category"
//   - key="<token>:<categoryId>"
//   - value={ token, categoryId, badCount, goodCount, strength }
//
// Consommation : au triage, avant d'accepter une catégorie proposée, on
// charge les avoidances et si ≥ UNE pénalité token↔cat est déclenchée
// entre le ticket et la catégorie, on downgrade la confidence.
//
// Interval : 6h, même cadence que similar-feedback-learner.
// ============================================================================

import prisma from "@/lib/prisma";
import { ageWeight } from "./feedback-decay";

const LOOKBACK_DAYS = 90;
const PENALTY_THRESHOLD = 3;
const MIN_TOKEN_LENGTH = 3;

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "une", "des", "les", "avec", "sans", "dans", "pour", "mais", "plus",
  "tous", "tout", "avoir", "faire", "bien", "autre", "autres", "notre",
  "cela", "cette", "celle", "celui", "sous", "vers", "lors", "ceux",
  "bonjour", "merci", "svp", "stp", "salut",
]);

interface Feedback {
  ticketId: string;
  suggestedCategoryId: string;
  verdict: "bad" | "good";
  weight: number;
}

export async function learnFromCategoryFeedback(): Promise<{
  feedbacksAnalyzed: number;
  avoidancesWritten: number;
  avoidancesReleased: number;
}> {
  const stats = {
    feedbacksAnalyzed: 0,
    avoidancesWritten: 0,
    avoidancesReleased: 0,
  };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: "category:feedback",
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
      typeof v.ticketId !== "string" ||
      typeof v.suggestedCategoryId !== "string" ||
      (v.verdict !== "bad" && v.verdict !== "good")
    ) {
      continue;
    }
    feedbacks.push({
      ticketId: v.ticketId,
      suggestedCategoryId: v.suggestedCategoryId,
      verdict: v.verdict,
      weight: ageWeight(r.createdAt),
    });
  }
  stats.feedbacksAnalyzed = feedbacks.length;
  if (feedbacks.length === 0) return stats;

  // Charge les textes des tickets concernés.
  const ticketIds = Array.from(new Set(feedbacks.map((f) => f.ticketId)));
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, subject: true, description: true },
  });
  const textByTicket = new Map(
    tickets.map((t) => [
      t.id,
      `${t.subject} ${(t.description ?? "").slice(0, 1000)}`,
    ]),
  );

  // Comptage bad/good par paire (token, categoryId), PONDÉRÉ par âge.
  // counts.get(token).get(categoryId) = { bad, good }
  const counts = new Map<string, Map<string, { bad: number; good: number }>>();
  for (const f of feedbacks) {
    const text = textByTicket.get(f.ticketId);
    if (!text) continue;
    const tokens = tokenize(text);
    for (const token of tokens) {
      const byCat = counts.get(token) ?? new Map();
      const cur = byCat.get(f.suggestedCategoryId) ?? { bad: 0, good: 0 };
      if (f.verdict === "bad") cur.bad += f.weight;
      else cur.good += f.weight;
      byCat.set(f.suggestedCategoryId, cur);
      counts.set(token, byCat);
    }
  }

  // Charge les avoidances existantes pour détecter celles à libérer.
  const existing = await prisma.aiPattern.findMany({
    where: {
      scope: "learned:category_suggest",
      kind: "avoid_token_for_category",
    },
    select: { id: true, key: true },
  });
  const existingKeys = new Set(existing.map((e) => e.key));

  const toUpsert: Array<{
    token: string;
    categoryId: string;
    bad: number;
    good: number;
  }> = [];
  const toRelease: string[] = [];

  for (const [token, byCat] of counts) {
    for (const [categoryId, c] of byCat) {
      const key = `${token}:${categoryId}`;
      if (c.bad >= PENALTY_THRESHOLD && c.bad > c.good * 2) {
        toUpsert.push({ token, categoryId, bad: c.bad, good: c.good });
      } else if (existingKeys.has(key) && c.good >= c.bad) {
        toRelease.push(key);
      }
    }
  }

  for (const t of toUpsert) {
    const key = `${t.token}:${t.categoryId}`;
    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "learned:category_suggest",
            kind: "avoid_token_for_category",
            key,
          },
        },
        create: {
          scope: "learned:category_suggest",
          kind: "avoid_token_for_category",
          key,
          value: {
            token: t.token,
            categoryId: t.categoryId,
            badCount: t.bad,
            goodCount: t.good,
            strength: Math.min(1, t.bad / 10),
            learnedAt: new Date().toISOString(),
          } as never,
          sampleCount: t.bad + t.good,
          confidence: Math.min(1, t.bad / 10),
        },
        update: {
          value: {
            token: t.token,
            categoryId: t.categoryId,
            badCount: t.bad,
            goodCount: t.good,
            strength: Math.min(1, t.bad / 10),
            learnedAt: new Date().toISOString(),
          } as never,
          sampleCount: t.bad + t.good,
          confidence: Math.min(1, t.bad / 10),
        },
      });
      stats.avoidancesWritten++;
    } catch (err) {
      console.warn(`[category-feedback] upsert ${key} failed:`, err);
    }
  }

  if (toRelease.length > 0) {
    await prisma.aiPattern.deleteMany({
      where: {
        scope: "learned:category_suggest",
        kind: "avoid_token_for_category",
        key: { in: toRelease },
      },
    });
    stats.avoidancesReleased = toRelease.length;
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenize(text: string): Set<string> {
  const norm = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  const out = new Set<string>();
  for (const w of norm.split(/\s+/)) {
    if (w.length < MIN_TOKEN_LENGTH) continue;
    if (STOP_WORDS.has(w)) continue;
    out.add(w);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helper public — le triage lit ces avoidances pour éviter de reproposer
// une catégorie marquée "bad" sur des tickets contenant les mêmes tokens.
//
// Retourne une map categoryId → Set<tokens> qui pénalisent cette catégorie.
// Cache 10 min.
// ---------------------------------------------------------------------------

interface AvoidCache {
  at: number;
  byCategory: Map<string, Map<string, number>>; // catId → (token → strength)
}
let avoidCache: AvoidCache = { at: 0, byCategory: new Map() };
const CACHE_TTL_MS = 10 * 60_000;

export async function getCategoryAvoidances(): Promise<
  Map<string, Map<string, number>>
> {
  if (Date.now() - avoidCache.at < CACHE_TTL_MS) {
    return avoidCache.byCategory;
  }
  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: "learned:category_suggest",
      kind: "avoid_token_for_category",
    },
    select: { value: true },
  });
  const byCategory = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const v = r.value as {
      token?: string;
      categoryId?: string;
      strength?: number;
    } | null;
    if (!v?.token || !v?.categoryId) continue;
    const map = byCategory.get(v.categoryId) ?? new Map<string, number>();
    map.set(v.token, v.strength ?? 0.5);
    byCategory.set(v.categoryId, map);
  }
  avoidCache = { at: Date.now(), byCategory };
  return byCategory;
}

/**
 * Combien cette catégorie est pénalisée pour CE texte ? Renvoie 0 si
 * aucune avoidance n'est déclenchée, sinon la somme des strengths des
 * tokens communs (plafonnée à 1).
 */
export async function categoryPenaltyForText(
  categoryId: string,
  text: string,
): Promise<number> {
  const avoidances = await getCategoryAvoidances();
  const tokensOfCat = avoidances.get(categoryId);
  if (!tokensOfCat || tokensOfCat.size === 0) return 0;
  const textTokens = tokenize(text);
  let total = 0;
  for (const [token, strength] of tokensOfCat) {
    if (textTokens.has(token)) total += strength;
  }
  return Math.min(1, total);
}
