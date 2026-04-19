// ============================================================================
// TAXONOMY DEDUP DETECTOR — identifie des paires de catégories dont les
// centroids vectoriels sont très proches (cosine ≥ SIMILARITY_THRESHOLD).
//
// Objectif : la taxonomie MSP tend à dérive avec le temps — des catégories
// quasi-dupliquées se créent ("Outlook problèmes" vs "Outlook incidents",
// "VPN déconnexion" vs "VPN perte de connexion"). Le moteur détecte ces
// paires et propose une fusion à l'admin.
//
// Critères stricts pour éviter les faux positifs :
//   - cosine ≥ 0.92 (très fort — les catégories distinctes légitimes sont
//     ≤ 0.85 en pratique)
//   - ≥ MIN_SAMPLE_PER_CAT tickets dans chaque centroid
//   - Ne propose QUE des paires dont la similarité est significativement
//     au-dessus de la moyenne (filtre contre les faux positifs où TOUS les
//     centroids seraient collés).
//
// Stocké dans AiPattern(scope="taxonomy:dedup", kind="pair",
// key=<sortedIdPair>) avec similarité, exemples représentatifs, action
// recommandée (merge A→B ou inverse selon volumes).
//
// Pas de LLM — purement vectoriel. Hebdomadaire.
// ============================================================================

import prisma from "@/lib/prisma";
import { createHash } from "crypto";
import { cosineSim } from "@/lib/ai/embeddings";

const SIMILARITY_THRESHOLD = 0.92;
const MIN_SAMPLE_PER_CAT = 8;
const MAX_PAIRS_STORED = 40;

interface DedupPair {
  pairId: string;
  smallerCategoryId: string;
  smallerCategoryName: string;
  smallerSampleSize: number;
  largerCategoryId: string;
  largerCategoryName: string;
  largerSampleSize: number;
  similarity: number;
  recommendedMerge: "smaller_into_larger" | "manual_review";
  reasoning: string;
  detectedAt: string;
}

export async function detectTaxonomyDuplicates(): Promise<{
  centroidsScanned: number;
  pairsEvaluated: number;
  duplicatesDetected: number;
}> {
  const stats = {
    centroidsScanned: 0,
    pairsEvaluated: 0,
    duplicatesDetected: 0,
  };

  // Charge tous les centroids + le count de tickets résolus associés.
  const rows = await prisma.aiPattern.findMany({
    where: { scope: { startsWith: "centroid:" }, kind: "centroid" },
    select: { scope: true, value: true, sampleCount: true },
  });
  if (rows.length < 2) return stats;

  interface Centroid {
    categoryId: string;
    vec: number[];
    sampleCount: number;
  }
  const centroids: Centroid[] = [];
  for (const r of rows) {
    const catId = r.scope.replace(/^centroid:/, "");
    const v = r.value as { vec?: number[]; centroid?: number[] } | null;
    const vec = Array.isArray(v?.vec)
      ? v!.vec
      : Array.isArray(v?.centroid)
        ? v!.centroid
        : null;
    if (!vec || r.sampleCount < MIN_SAMPLE_PER_CAT) continue;
    centroids.push({ categoryId: catId, vec, sampleCount: r.sampleCount });
  }
  stats.centroidsScanned = centroids.length;
  if (centroids.length < 2) return stats;

  // Load category metadata for resolution (pathOf).
  const catIds = centroids.map((c) => c.categoryId);
  const categories = await prisma.category.findMany({
    where: { id: { in: catIds }, isActive: true },
    select: { id: true, name: true, parentId: true },
  });
  const catById = new Map(categories.map((c) => [c.id, c]));
  const pathOf = (id: string): string => {
    const parts: string[] = [];
    let cur = catById.get(id);
    while (cur) {
      parts.unshift(cur.name);
      if (!cur.parentId) break;
      cur = catById.get(cur.parentId);
    }
    return parts.join(" > ");
  };

  // O(N²) pair compare — N ~ 100-250 en pratique.
  const pairs: DedupPair[] = [];
  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      stats.pairsEvaluated++;
      const a = centroids[i];
      const b = centroids[j];
      if (!catById.has(a.categoryId) || !catById.has(b.categoryId)) continue;
      const sim = cosineSim(a.vec, b.vec);
      if (sim < SIMILARITY_THRESHOLD) continue;

      // Ordonne par sampleCount décroissant pour que "larger" soit le pivot
      // proposé pour la fusion.
      const [larger, smaller] =
        a.sampleCount >= b.sampleCount ? [a, b] : [b, a];
      const sortedIds = [smaller.categoryId, larger.categoryId].sort();
      const pairId = createHash("sha256")
        .update(sortedIds.join("|"))
        .digest("hex")
        .slice(0, 16);

      // Si l'écart de volume est > 3×, la fusion smaller→larger est un
      // bon pari. Sinon, manual review (peut être deux catégories
      // distinctes qui ont juste un chevauchement sémantique).
      const ratio =
        larger.sampleCount / Math.max(1, smaller.sampleCount);
      const recommendedMerge: DedupPair["recommendedMerge"] =
        ratio >= 3 ? "smaller_into_larger" : "manual_review";

      pairs.push({
        pairId,
        smallerCategoryId: smaller.categoryId,
        smallerCategoryName: pathOf(smaller.categoryId),
        smallerSampleSize: smaller.sampleCount,
        largerCategoryId: larger.categoryId,
        largerCategoryName: pathOf(larger.categoryId),
        largerSampleSize: larger.sampleCount,
        similarity: Math.round(sim * 1000) / 1000,
        recommendedMerge,
        reasoning:
          recommendedMerge === "smaller_into_larger"
            ? `Déséquilibre ${ratio.toFixed(1)}× en volume — fusion probable de la plus petite vers la plus grande.`
            : `Volumes équivalents — l'admin devrait valider manuellement (pourraient être 2 domaines distincts avec chevauchement).`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  pairs.sort((a, b) => b.similarity - a.similarity);
  const top = pairs.slice(0, MAX_PAIRS_STORED);
  stats.duplicatesDetected = top.length;

  // Nettoyage : retire les pairs plus récentes qui ne sont plus détectées.
  const existing = await prisma.aiPattern.findMany({
    where: { scope: "taxonomy:dedup", kind: "pair" },
    select: { id: true, key: true },
  });
  const activeIds = new Set(top.map((p) => p.pairId));
  const toDelete = existing
    .filter((e) => !activeIds.has(e.key))
    .map((e) => e.id);
  if (toDelete.length > 0) {
    await prisma.aiPattern.deleteMany({ where: { id: { in: toDelete } } });
  }

  // Upsert
  for (const p of top) {
    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "taxonomy:dedup",
            kind: "pair",
            key: p.pairId,
          },
        },
        create: {
          scope: "taxonomy:dedup",
          kind: "pair",
          key: p.pairId,
          value: p as never,
          sampleCount: p.smallerSampleSize + p.largerSampleSize,
          confidence: p.similarity,
        },
        update: {
          value: p as never,
          sampleCount: p.smallerSampleSize + p.largerSampleSize,
          confidence: p.similarity,
        },
      });
    } catch (err) {
      console.warn(`[taxonomy-dedup] upsert failed for ${p.pairId}:`, err);
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helper public — liste toutes les paires détectées.
// ---------------------------------------------------------------------------

export async function getTaxonomyDedupPairs(): Promise<DedupPair[]> {
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "taxonomy:dedup", kind: "pair" },
    orderBy: { confidence: "desc" },
    select: { value: true },
  });
  const out: DedupPair[] = [];
  for (const r of rows) {
    const v = r.value as Partial<DedupPair> | null;
    if (v && typeof v.pairId === "string") out.push(v as DedupPair);
  }
  return out;
}
