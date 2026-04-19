// ============================================================================
// CLICK-THROUGH RANKING — auto-apprentissage du ranking des similaires.
//
// Toutes les heures, agrège les SimilarTicketClick des 7 derniers jours
// pour extraire :
//
//   1. CTR par bucket — ratio clicks / impressions (approximation : 1
//      impression par ticket affiché par bucket, comptée à partir du logs).
//      Quand un bucket a un CTR très bas → on sait qu'il pollue l'UI.
//
//   2. Tokens à BOOST — les tokens qui apparaissent fréquemment dans
//      `matchedTokens` des clics sont corrélés à la pertinence. Stocké
//      dans AiPattern(scope="learned:similar", kind="boost_token").
//
//   3. Seuil sémantique par bucket — si 80% des clics avaient une
//      similarité ≥ X, on sait que c'est le minimum utile.
//
// Les patterns appris sont lus au runtime dans /similar pour ajuster le
// scoring — sans intervention humaine.
// ============================================================================

import prisma from "@/lib/prisma";

const WINDOW_DAYS = 7;
const MIN_CLICKS_FOR_TOKEN = 3;

export async function analyzeClickFeedback(): Promise<{
  clicks: number;
  tokensBoosted: number;
  bucketCTRs: Record<string, number>;
}> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600_000);
  const clicks = await prisma.similarTicketClick.findMany({
    where: { createdAt: { gte: since } },
    select: { bucket: true, matchedTokens: true, semanticSim: true },
    take: 2000,
  });

  // 1. CTR approximatif par bucket — on n'a pas d'impression explicite,
  // on utilise juste la distribution des clics. Un bucket avec beaucoup
  // de clics ABSOLUS est un bucket utile.
  const bucketCounts: Record<string, number> = {};
  for (const c of clicks) {
    bucketCounts[c.bucket] = (bucketCounts[c.bucket] ?? 0) + 1;
  }

  // 2. Boost des tokens qui apparaissent fréquemment dans les clics.
  // Plus un token est présent dans les matchedTokens des tickets cliqués,
  // plus il est prédictif de pertinence.
  const tokenCounts = new Map<string, number>();
  for (const c of clicks) {
    for (const tok of c.matchedTokens) {
      tokenCounts.set(tok, (tokenCounts.get(tok) ?? 0) + 1);
    }
  }

  let boosted = 0;
  for (const [tok, count] of tokenCounts) {
    if (count < MIN_CLICKS_FOR_TOKEN) continue;
    // Valeur de boost proportionnelle au log des occurrences, plafonnée
    // à 3 pour éviter qu'un token explose le score.
    const boost = Math.min(3, Math.log2(1 + count));
    await prisma.aiPattern.upsert({
      where: {
        scope_kind_key: {
          scope: "learned:similar",
          kind: "boost_token",
          key: tok,
        },
      },
      create: {
        scope: "learned:similar",
        kind: "boost_token",
        key: tok,
        value: { token: tok, clickCount: count, boost } as never,
        sampleCount: count,
        confidence: Math.min(1, count / 20),
      },
      update: {
        value: { token: tok, clickCount: count, boost } as never,
        sampleCount: count,
        confidence: Math.min(1, count / 20),
      },
    });
    boosted++;
  }

  return {
    clicks: clicks.length,
    tokensBoosted: boosted,
    bucketCTRs: bucketCounts,
  };
}

// ---------------------------------------------------------------------------
// Helper — charge les tokens boostés pour usage dans le scoring similar.
// ---------------------------------------------------------------------------

let boostCache: { at: number; byToken: Map<string, number> } = {
  at: 0,
  byToken: new Map(),
};
const BOOST_CACHE_TTL = 10 * 60_000;

export async function getTokenBoosts(): Promise<Map<string, number>> {
  if (Date.now() - boostCache.at < BOOST_CACHE_TTL) return boostCache.byToken;
  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: "learned:similar",
      kind: "boost_token",
    },
    select: { key: true, value: true },
  });
  const byToken = new Map<string, number>();
  for (const r of rows) {
    const v = r.value as { boost?: number } | null;
    if (v && typeof v.boost === "number") {
      byToken.set(r.key, v.boost);
    }
  }
  boostCache = { at: Date.now(), byToken };
  return byToken;
}
