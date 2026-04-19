// ============================================================================
// CATEGORY CENTROIDS — ancrage vectoriel pour le triage.
//
// Pour chaque catégorie qui a ≥ MIN_TICKETS_PER_CAT tickets résolus avec
// embedding, on calcule le vecteur MOYEN (centroid). Ce centroid représente
// "le sujet type" de la catégorie, appris depuis tous les tickets
// historiques qui y ont été classés.
//
// Utilisation au triage :
//   1. Embedding du nouveau ticket
//   2. Cosine vs chaque centroid → top-3 catégories par similarité
//   3. Injecté dans le prompt LLM comme SUGGESTION SÉMANTIQUE
//   4. Sanity check post-LLM : si le LLM choisit une catégorie hors top-5
//      des centroids ET que la cosine à son centroid est <0.4 → rejet
//
// Avantage majeur : robuste aux hallucinations. Même si gemma3 divague,
// le centroid reste ancré dans le réel (moyenne de vrais tickets passés).
//
// Stocké dans AiPattern(scope="centroid:<categoryId>", kind="centroid").
// Recalculé toutes les 6h par le job `category-centroids`.
// ============================================================================

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { cosineSim } from "@/lib/ai/embeddings";

const MIN_TICKETS_PER_CAT = Number(
  process.env.CENTROID_MIN_TICKETS || 5,
);

export async function rebuildCategoryCentroids(): Promise<{
  categories: number;
  centroids: number;
  skipped: number;
}> {
  const stats = { categories: 0, centroids: 0, skipped: 0 };

  // Toutes les catégories actives (feuilles + parents — un centroid parent
  // aide aussi pour les tickets peu spécifiques).
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  stats.categories = categories.length;

  for (const cat of categories) {
    // Tickets RÉSOLUS ou CLOSED avec embedding, derniers 12 mois max.
    const yearAgo = new Date(Date.now() - 365 * 24 * 3600_000);
    const tickets = await prisma.ticket.findMany({
      where: {
        categoryId: cat.id,
        status: { in: ["RESOLVED", "CLOSED"] },
        closedAt: { gte: yearAgo },
        NOT: { embedding: { equals: Prisma.DbNull } },
      },
      select: { embedding: true },
      take: 200, // Plafond pour ne pas exploser la mémoire si une cat a 5k tickets
    });

    if (tickets.length < MIN_TICKETS_PER_CAT) {
      stats.skipped++;
      continue;
    }

    // Moyenne des vecteurs. On part du premier, additionne les autres,
    // divise par N à la fin. Tous les embeddings ont la même dimension
    // (768 pour nomic-embed-text) — validé par embed() côté provider.
    const first = tickets[0].embedding as number[] | null;
    if (!Array.isArray(first) || first.length === 0) {
      stats.skipped++;
      continue;
    }
    const dim = first.length;
    const sum = new Array<number>(dim).fill(0);
    let count = 0;
    for (const t of tickets) {
      const v = t.embedding as number[] | null;
      if (!Array.isArray(v) || v.length !== dim) continue;
      for (let i = 0; i < dim; i++) sum[i] += v[i];
      count++;
    }
    if (count < MIN_TICKETS_PER_CAT) {
      stats.skipped++;
      continue;
    }
    const centroid = sum.map((s) => s / count);

    await prisma.aiPattern.upsert({
      where: {
        scope_kind_key: {
          scope: `centroid:${cat.id}`,
          kind: "centroid",
          key: "embedding",
        },
      },
      create: {
        scope: `centroid:${cat.id}`,
        kind: "centroid",
        key: "embedding",
        value: { centroid, sampleCount: count, dim } as never,
        sampleCount: count,
        confidence: Math.min(1, count / 20),
      },
      update: {
        value: { centroid, sampleCount: count, dim } as never,
        sampleCount: count,
        confidence: Math.min(1, count / 20),
      },
    });
    stats.centroids++;
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helper : suggère les top-N catégories par similarité centroid
// ---------------------------------------------------------------------------

interface CentroidMatch {
  categoryId: string;
  similarity: number;
  sampleCount: number;
}

let centroidCache: {
  at: number;
  data: Array<{ categoryId: string; vector: number[]; sampleCount: number }>;
} | null = null;
const CENTROID_CACHE_TTL = 10 * 60_000; // 10 min — recalcul complet toutes les 6h de toute façon

export async function suggestCategoriesByCentroid(
  vec: number[],
  topN = 5,
): Promise<CentroidMatch[]> {
  if (!Array.isArray(vec) || vec.length === 0) return [];

  // Cache en mémoire pour éviter un scan DB à chaque triage. Invalide
  // automatiquement après CENTROID_CACHE_TTL.
  if (!centroidCache || Date.now() - centroidCache.at > CENTROID_CACHE_TTL) {
    const rows = await prisma.aiPattern.findMany({
      where: {
        scope: { startsWith: "centroid:" },
        kind: "centroid",
        key: "embedding",
      },
      select: { scope: true, value: true, sampleCount: true },
    });
    const data: Array<{ categoryId: string; vector: number[]; sampleCount: number }> = [];
    for (const r of rows) {
      const v = r.value as { centroid?: unknown } | null;
      if (!v || !Array.isArray(v.centroid)) continue;
      data.push({
        categoryId: r.scope.replace("centroid:", ""),
        vector: v.centroid as number[],
        sampleCount: r.sampleCount,
      });
    }
    centroidCache = { at: Date.now(), data };
  }

  const matches: CentroidMatch[] = centroidCache.data.map((c) => ({
    categoryId: c.categoryId,
    similarity: cosineSim(vec, c.vector),
    sampleCount: c.sampleCount,
  }));
  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, topN);
}
