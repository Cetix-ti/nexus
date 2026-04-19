// ============================================================================
// TRIAGE FEEDBACK LEARNER — transforme les thumbs-down sur les suggestions
// PRIORITY / TYPE / DUPLICATE du triage IA en pénalités utilisables par le
// scorer.
//
// Fonctionne identiquement au category-feedback-learner mais sur 3 champs
// distincts. Chaque champ a son propre stockage de pénalités :
//   scope="learned:triage:<field>", kind="avoid_token_for_value"
//   key="<token>:<value>"
//
// Hypothèse : si un tech marque "faux doublon" pour un ticket X avec la
// suggestion Y, les tokens partagés entre X et Y (hors stop-words) ont
// probablement orienté le scorer à tort. On pénalise donc la paire
// token → valeur-suggérée-fautive pour que la prochaine fois, le scorer
// downgrade son score quand il rencontre ces tokens.
//
// Particularités par champ :
//   - priority  : la "valeur" est la priorité suggérée (low/medium/high/critical)
//   - type      : la "valeur" est le type (INCIDENT/SERVICE_REQUEST/...)
//   - duplicate : la "valeur" est l'id du ticket-doublon — pas de
//                 généralisation possible (chaque ticket est unique), on
//                 se contente d'exclure la paire exacte (source, suggéré)
//
// Interval : 6h.
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

const FIELDS = ["priority", "type", "duplicate"] as const;
type Field = (typeof FIELDS)[number];

interface Feedback {
  ticketId: string;
  suggestedValue: string;
  verdict: "bad" | "good";
  weight: number;
}

export async function runTriageFeedbackLearner(): Promise<{
  feedbacksAnalyzed: number;
  penaltiesWritten: number;
  penaltiesReleased: number;
}> {
  const stats = {
    feedbacksAnalyzed: 0,
    penaltiesWritten: 0,
    penaltiesReleased: 0,
  };

  for (const field of FIELDS) {
    const r = await learnField(field);
    stats.feedbacksAnalyzed += r.feedbacksAnalyzed;
    stats.penaltiesWritten += r.penaltiesWritten;
    stats.penaltiesReleased += r.penaltiesReleased;
  }

  return stats;
}

async function learnField(field: Field): Promise<{
  feedbacksAnalyzed: number;
  penaltiesWritten: number;
  penaltiesReleased: number;
}> {
  const stats = {
    feedbacksAnalyzed: 0,
    penaltiesWritten: 0,
    penaltiesReleased: 0,
  };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: `triage:feedback:${field}`,
      kind: "pair",
      createdAt: { gte: since },
    },
    select: { value: true, createdAt: true },
  });

  const feedbacks: Feedback[] = [];
  for (const r of rows) {
    const v = r.value as {
      ticketId?: string;
      suggestedValue?: string;
      verdict?: string;
    } | null;
    if (
      !v?.ticketId ||
      !v?.suggestedValue ||
      (v.verdict !== "bad" && v.verdict !== "good")
    ) {
      continue;
    }
    feedbacks.push({
      ticketId: v.ticketId,
      suggestedValue: v.suggestedValue,
      verdict: v.verdict,
      weight: ageWeight(r.createdAt),
    });
  }
  stats.feedbacksAnalyzed = feedbacks.length;
  if (feedbacks.length === 0) return stats;

  // Pour duplicate : agrégation directe par paire (ticketId, suggestedId) —
  // pas de généralisation via tokens.
  if (field === "duplicate") {
    // Pas besoin de learner avancé : l'exclusion est déjà faite au niveau
    // du widget via le feedback lui-même (le triage sait lire les entrées
    // existantes). On se contente de nettoyer les pairs explicitement
    // libérées (goodCount ≥ badCount).
    return stats;
  }

  // Pour priority / type : extraction de tokens partagés.
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

  // counts.get(token).get(value) = { bad, good } — pondéré par âge.
  const counts = new Map<string, Map<string, { bad: number; good: number }>>();
  for (const f of feedbacks) {
    const text = textByTicket.get(f.ticketId);
    if (!text) continue;
    const tokens = tokenize(text);
    for (const token of tokens) {
      const byValue = counts.get(token) ?? new Map();
      const cur = byValue.get(f.suggestedValue) ?? { bad: 0, good: 0 };
      if (f.verdict === "bad") cur.bad += f.weight;
      else cur.good += f.weight;
      byValue.set(f.suggestedValue, cur);
      counts.set(token, byValue);
    }
  }

  const existing = await prisma.aiPattern.findMany({
    where: {
      scope: `learned:triage:${field}`,
      kind: "avoid_token_for_value",
    },
    select: { id: true, key: true },
  });
  const existingKeys = new Set(existing.map((e) => e.key));

  const toUpsert: Array<{
    token: string;
    value: string;
    bad: number;
    good: number;
  }> = [];
  const toRelease: string[] = [];

  for (const [token, byValue] of counts) {
    for (const [value, c] of byValue) {
      const key = `${token}:${value}`;
      if (c.bad >= PENALTY_THRESHOLD && c.bad > c.good * 2) {
        toUpsert.push({ token, value, bad: c.bad, good: c.good });
      } else if (existingKeys.has(key) && c.good >= c.bad) {
        toRelease.push(key);
      }
    }
  }

  for (const t of toUpsert) {
    const key = `${t.token}:${t.value}`;
    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: `learned:triage:${field}`,
            kind: "avoid_token_for_value",
            key,
          },
        },
        create: {
          scope: `learned:triage:${field}`,
          kind: "avoid_token_for_value",
          key,
          value: {
            field,
            token: t.token,
            suggestedValue: t.value,
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
            field,
            token: t.token,
            suggestedValue: t.value,
            badCount: t.bad,
            goodCount: t.good,
            strength: Math.min(1, t.bad / 10),
            learnedAt: new Date().toISOString(),
          } as never,
          sampleCount: t.bad + t.good,
          confidence: Math.min(1, t.bad / 10),
        },
      });
      stats.penaltiesWritten++;
    } catch (err) {
      console.warn(
        `[triage-feedback/${field}] upsert ${key} failed:`,
        err,
      );
    }
  }

  if (toRelease.length > 0) {
    await prisma.aiPattern.deleteMany({
      where: {
        scope: `learned:triage:${field}`,
        kind: "avoid_token_for_value",
        key: { in: toRelease },
      },
    });
    stats.penaltiesReleased = toRelease.length;
  }

  return stats;
}

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
// Helper public — pénalité calculée pour une valeur suggérée pour un texte
// donné. Utilisé par le triage pour downgrade la confidence.
//
// Returns 0 si aucune pénalité ne s'applique, sinon somme des strengths
// (plafonnée à 1).
// ---------------------------------------------------------------------------

interface PenaltyCache {
  at: number;
  byField: Map<Field, Map<string, Map<string, number>>>; // field → value → (token → strength)
}
let cache: PenaltyCache = { at: 0, byField: new Map() };
const CACHE_TTL_MS = 10 * 60_000;

async function ensureCache(): Promise<void> {
  if (Date.now() - cache.at < CACHE_TTL_MS) return;
  const byField = new Map<Field, Map<string, Map<string, number>>>();
  for (const field of FIELDS) {
    if (field === "duplicate") continue;
    const rows = await prisma.aiPattern.findMany({
      where: {
        scope: `learned:triage:${field}`,
        kind: "avoid_token_for_value",
      },
      select: { value: true },
    });
    const byValue = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const v = r.value as {
        token?: string;
        suggestedValue?: string;
        strength?: number;
      } | null;
      if (!v?.token || !v?.suggestedValue) continue;
      const map = byValue.get(v.suggestedValue) ?? new Map<string, number>();
      map.set(v.token, v.strength ?? 0.5);
      byValue.set(v.suggestedValue, map);
    }
    byField.set(field, byValue);
  }
  cache = { at: Date.now(), byField };
}

export async function triagePenaltyForText(
  field: "priority" | "type",
  suggestedValue: string,
  text: string,
): Promise<number> {
  await ensureCache();
  const byValue = cache.byField.get(field);
  if (!byValue) return 0;
  const tokensOfValue = byValue.get(suggestedValue);
  if (!tokensOfValue || tokensOfValue.size === 0) return 0;
  const textTokens = tokenize(text);
  let total = 0;
  for (const [token, strength] of tokensOfValue) {
    if (textTokens.has(token)) total += strength;
  }
  return Math.min(1, total);
}

// ---------------------------------------------------------------------------
// Helper public pour les doublons : la paire exacte (sourceTicketId,
// suggestedTicketId) doit-elle être exclue ? Lit directement les pairs
// triage:feedback:duplicate verdict=bad.
// ---------------------------------------------------------------------------

interface DuplicateExclusionCache {
  at: number;
  bySource: Map<string, Set<string>>; // sourceTicketId → Set<suggestedTicketId>
}
let dupCache: DuplicateExclusionCache = { at: 0, bySource: new Map() };

async function ensureDupCache(): Promise<void> {
  if (Date.now() - dupCache.at < CACHE_TTL_MS) return;
  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: "triage:feedback:duplicate",
      kind: "pair",
    },
    select: { value: true },
  });
  const bySource = new Map<string, Set<string>>();
  for (const r of rows) {
    const v = r.value as {
      ticketId?: string;
      suggestedValue?: string;
      verdict?: string;
    } | null;
    if (!v?.ticketId || !v?.suggestedValue) continue;
    if (v.verdict !== "bad") continue;
    const set = bySource.get(v.ticketId) ?? new Set<string>();
    set.add(v.suggestedValue);
    bySource.set(v.ticketId, set);
  }
  dupCache = { at: Date.now(), bySource };
}

export async function isDuplicateExcluded(
  sourceTicketId: string,
  suggestedTicketId: string,
): Promise<boolean> {
  await ensureDupCache();
  return (
    dupCache.bySource.get(sourceTicketId)?.has(suggestedTicketId) ?? false
  );
}
