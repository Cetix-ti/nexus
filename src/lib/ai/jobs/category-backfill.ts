// ============================================================================
// Category backfill — parcourt les tickets sans categoryId et lance le
// triage IA pour leur assigner une catégorie. À appeler par lots (limit)
// depuis un endpoint admin — la triage UNE fois par ticket seulement, et
// la fenêtre d'idempotence 60s de triageTicket() protège des appels
// concurrents.
//
// Le ticket est compté comme "traité" dès qu'une invocation `triage` est
// loguée avec status=ok, même si la confiance est trop basse pour appliquer
// la catégorie (on garde la trace pour exposer les boutons de feedback
// côté UI et alimenter l'apprentissage).
// ============================================================================

import prisma from "@/lib/prisma";
import { triageTicketAsync } from "@/lib/ai/features/triage";

export interface BackfillRunResult {
  processed: number;
  skippedExistingInvocation: number;
  errors: number;
  remaining: number;
}

/**
 * Compte les tickets "catégorisables" qui n'ont pas encore de catégorie.
 * Exclut la corbeille et les tickets trop courts pour un triage utile.
 */
export async function countCategorizableTicketsWithoutCategory(): Promise<number> {
  return prisma.ticket.count({
    where: {
      categoryId: null,
      status: { not: "DELETED" },
      subject: { not: "" },
    },
  });
}

export async function runCategoryBackfill(
  options: { batchSize?: number } = {},
): Promise<BackfillRunResult> {
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 25, 100));

  const remaining = await countCategorizableTicketsWithoutCategory();

  // On pioche les plus anciens d'abord (stables) — la fenêtre temporelle
  // descendante permet de garder un ordre prédictible d'un run à l'autre.
  const batch = await prisma.ticket.findMany({
    where: {
      categoryId: null,
      status: { not: "DELETED" },
      subject: { not: "" },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  // Skip les tickets qui ont DÉJÀ une invocation triage récente (ex: job
  // déjà passé sur ce ticket mais l'IA a retourné une catégorie en-dessous
  // du floor → inutile de rejouer). Ces tickets garderont leur AiInvocation
  // existante (et donc les boutons de feedback restent visibles côté UI).
  const ids = batch.map((t) => t.id);
  const alreadyTriaged = await prisma.aiInvocation.findMany({
    where: {
      feature: "triage",
      status: "ok",
      ticketId: { in: ids },
    },
    select: { ticketId: true },
  });
  const triagedSet = new Set(alreadyTriaged.map((i) => i.ticketId));

  let processed = 0;
  let errors = 0;
  let skipped = 0;
  for (const t of batch) {
    if (triagedSet.has(t.id)) {
      skipped++;
      continue;
    }
    try {
      await triageTicketAsync(t.id);
      processed++;
    } catch (err) {
      errors++;
      console.warn("[category-backfill] échec ticket", t.id, err);
    }
  }

  return {
    processed,
    skippedExistingInvocation: skipped,
    errors,
    remaining: Math.max(0, remaining - processed - skipped),
  };
}
