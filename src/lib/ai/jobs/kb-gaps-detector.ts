// ============================================================================
// KB GAPS DETECTOR — identifie les catégories où l'IA se plante régulièrement
// ET où la KB n'a pas d'article couvrant. Résultat : une liste priorisée de
// « articles KB à écrire en priorité » surfacée aux admins / techs seniors.
//
// Signaux croisés :
//   1. Audit disagree / partial rate élevé par catégorie (via AiAuditResult
//      joint au ticket.categoryId).
//   2. Digital-twin : tickets où la prédiction IA a été fausse, groupés par
//      catégorie réelle.
//   3. Recurring detector : patterns récurrents qui n'ont pas encore
//      d'article KB correspondant.
//
// Puis pour chaque catégorie candidate, on vérifie s'il existe un article KB
// PUBLISHED dont l'embedding est proche (cosine ≥ 0.6) du centroid de la
// catégorie. Si NON → gap confirmé.
//
// Stocké dans AiPattern(scope="meta:kb_gaps", kind="category", key=<catId>)
// avec un `priority` calculé : (# tickets impactés) × (disagreement rate) /
// (kb_coverage). Plus c'est élevé, plus ça fait mal.
//
// Pas de LLM — purement analytique. Refresh hebdomadaire suffit.
// ============================================================================

import prisma from "@/lib/prisma";
import { cosineSim } from "@/lib/ai/embeddings";

const LOOKBACK_DAYS = 60;
const MIN_AUDITS_PER_CATEGORY = 6;
const DISAGREE_THRESHOLD = 0.25;
const KB_COVERAGE_SIM_THRESHOLD = 0.6;
const TOP_GAPS_TO_STORE = 50;

interface KbGap {
  categoryId: string;
  categoryName: string;
  categoryPath: string;
  impactedTickets: number;
  disagreementRate: number;
  kbCoverage: number;      // 0 = aucun article proche, 1 = article très aligné
  priority: number;        // score composite
  sampleTicketIds: string[]; // 3-5 exemples pour que le rédacteur ait du contexte
  refreshedAt: string;
}

export async function detectKbGaps(): Promise<{
  categoriesAnalyzed: number;
  gapsDetected: number;
  gapsWritten: number;
}> {
  const stats = {
    categoriesAnalyzed: 0,
    gapsDetected: 0,
    gapsWritten: 0,
  };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  // 1. Jointure audits × tickets pour récupérer la catégorie RÉELLE de chaque
  //    ticket audité.
  const audits = await prisma.aiAuditResult.findMany({
    where: { createdAt: { gte: since } },
    select: { verdict: true, invocationId: true },
  });
  if (audits.length < 20) return stats;

  const invocationIds = audits.map((a) => a.invocationId);
  const invocations = await prisma.aiInvocation.findMany({
    where: { id: { in: invocationIds } },
    select: { id: true, ticketId: true },
  });
  const invMap = new Map(invocations.map((i) => [i.id, i.ticketId]));

  const ticketIds = invocations
    .map((i) => i.ticketId)
    .filter((x): x is string => !!x);
  if (ticketIds.length === 0) return stats;

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, categoryId: true, subject: true },
  });
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));

  // 2. Agrège disagreements par catégorie.
  const byCategory = new Map<
    string,
    {
      audits: number;
      disagrees: number;
      partials: number;
      tickets: Set<string>;
      sampleTicketIds: string[];
    }
  >();

  for (const a of audits) {
    const ticketId = invMap.get(a.invocationId);
    if (!ticketId) continue;
    const tck = ticketMap.get(ticketId);
    if (!tck?.categoryId) continue;
    const row = byCategory.get(tck.categoryId) ?? {
      audits: 0,
      disagrees: 0,
      partials: 0,
      tickets: new Set<string>(),
      sampleTicketIds: [] as string[],
    };
    row.audits++;
    if (a.verdict === "disagree") row.disagrees++;
    else if (a.verdict === "partial") row.partials++;
    row.tickets.add(ticketId);
    if (
      (a.verdict === "disagree" || a.verdict === "partial") &&
      row.sampleTicketIds.length < 5 &&
      !row.sampleTicketIds.includes(ticketId)
    ) {
      row.sampleTicketIds.push(ticketId);
    }
    byCategory.set(tck.categoryId, row);
  }

  stats.categoriesAnalyzed = byCategory.size;

  // 3. Charge les centroids catégorie (déjà calculés par category-centroids).
  //    Scope pattern : "centroid:<categoryId>", kind="centroid".
  const centroidRows = await prisma.aiPattern.findMany({
    where: { scope: { startsWith: "centroid:" }, kind: "centroid" },
    select: { scope: true, value: true },
  });
  const centroidByCat = new Map<string, number[]>();
  for (const r of centroidRows) {
    const catId = r.scope.replace(/^centroid:/, "");
    const v = r.value as { vec?: number[]; centroid?: number[] } | null;
    const vec = Array.isArray(v?.vec)
      ? v!.vec
      : Array.isArray(v?.centroid)
        ? v!.centroid
        : null;
    if (vec) centroidByCat.set(catId, vec);
  }

  // 4. Charge les embeddings KB (déjà calculés par kb-indexer).
  const kbRows = await prisma.aiPattern.findMany({
    where: { scope: "kb:embedding", kind: "article" },
    select: { key: true, value: true },
  });
  const kbEmbeddings: Array<{ articleId: string; vec: number[] }> = [];
  for (const r of kbRows) {
    const v = r.value as { vec?: number[] } | null;
    if (Array.isArray(v?.vec)) {
      kbEmbeddings.push({ articleId: r.key, vec: v!.vec });
    }
  }

  // 5. Catégories éligibles : charge leurs noms/paths.
  const categoryIds = Array.from(byCategory.keys());
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
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

  // 6. Pour chaque catégorie candidate, calcule priority + kb_coverage.
  const gaps: KbGap[] = [];
  for (const [categoryId, row] of byCategory) {
    if (row.audits < MIN_AUDITS_PER_CATEGORY) continue;
    const disagreementRate = (row.disagrees + row.partials * 0.5) / row.audits;
    if (disagreementRate < DISAGREE_THRESHOLD) continue;

    // KB coverage : cosine max entre centroid de la cat et n'importe quel
    // article KB. Si pas de centroid (catégorie sans tickets résolus
    // embeddés), on considère coverage = 0 (besoin fort).
    const centroid = centroidByCat.get(categoryId);
    let kbCoverage = 0;
    if (centroid && kbEmbeddings.length > 0) {
      for (const kb of kbEmbeddings) {
        const sim = cosineSim(centroid, kb.vec);
        if (sim > kbCoverage) kbCoverage = sim;
      }
    }
    // Normalise en "0 = pas d'article qui couvre, 1 = article très aligné".
    const normalizedCoverage =
      kbCoverage >= KB_COVERAGE_SIM_THRESHOLD
        ? (kbCoverage - KB_COVERAGE_SIM_THRESHOLD) /
          (1 - KB_COVERAGE_SIM_THRESHOLD)
        : 0;

    // Priorité : impact (tickets) × erreur (disagreement) × gap (inverse coverage).
    const priority =
      Math.round(
        row.tickets.size * disagreementRate * (1 - normalizedCoverage) * 100,
      ) / 100;

    if (priority < 1) continue; // peu d'impact, on ignore

    const cat = catById.get(categoryId);
    gaps.push({
      categoryId,
      categoryName: cat?.name ?? "(inconnu)",
      categoryPath: pathOf(categoryId),
      impactedTickets: row.tickets.size,
      disagreementRate: Math.round(disagreementRate * 1000) / 1000,
      kbCoverage: Math.round(normalizedCoverage * 1000) / 1000,
      priority,
      sampleTicketIds: row.sampleTicketIds,
      refreshedAt: new Date().toISOString(),
    });
  }

  gaps.sort((a, b) => b.priority - a.priority);
  const top = gaps.slice(0, TOP_GAPS_TO_STORE);
  stats.gapsDetected = top.length;

  // 7. Upsert + nettoyage des gaps obsolètes.
  const activeIds = new Set(top.map((g) => g.categoryId));
  const existing = await prisma.aiPattern.findMany({
    where: { scope: "meta:kb_gaps", kind: "category" },
    select: { id: true, key: true },
  });
  const toDelete: string[] = [];
  for (const e of existing) {
    if (!activeIds.has(e.key)) toDelete.push(e.id);
  }
  if (toDelete.length > 0) {
    await prisma.aiPattern.deleteMany({ where: { id: { in: toDelete } } });
  }

  for (const g of top) {
    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "meta:kb_gaps",
            kind: "category",
            key: g.categoryId,
          },
        },
        create: {
          scope: "meta:kb_gaps",
          kind: "category",
          key: g.categoryId,
          value: g as never,
          sampleCount: g.impactedTickets,
          confidence: Math.min(1, g.priority / 20),
        },
        update: {
          value: g as never,
          sampleCount: g.impactedTickets,
          confidence: Math.min(1, g.priority / 20),
        },
      });
      stats.gapsWritten++;
    } catch (err) {
      console.warn(
        `[kb-gaps] upsert failed for cat ${g.categoryId}:`,
        err,
      );
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helper public — top N gaps triés par priorité, pour un dashboard admin.
// ---------------------------------------------------------------------------

export async function getTopKbGaps(limit = 10): Promise<KbGap[]> {
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "meta:kb_gaps", kind: "category" },
    select: { value: true },
  });
  const gaps: KbGap[] = [];
  for (const r of rows) {
    const v = r.value as Partial<KbGap> | null;
    if (
      v &&
      typeof v.categoryId === "string" &&
      typeof v.priority === "number"
    ) {
      gaps.push(v as KbGap);
    }
  }
  gaps.sort((a, b) => b.priority - a.priority);
  return gaps.slice(0, limit);
}
