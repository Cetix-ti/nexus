// ============================================================================
// RETENTION ANONYMIZATION — conformité Loi 25.
//
// **ON ANONYMISE, ON NE SUPPRIME PAS.** Les rows sont conservées pour les
// agrégats (stats, dashboards, tendances) mais leurs champs identifiants
// (userId, ticketId, organizationId, response, humanEdit) sont strippés
// après la période de rétention.
//
// Bénéfices vs suppression :
//   - Continuité des stats (pas de trous dans les courbes)
//   - Budget/coûts historiques préservés pour le reporting fiscal
//   - Démonstration CAI : "ce row a été anonymisé le X, ses données
//     identifiantes ont été retirées" (traçabilité vs "disparu")
//   - Patterns agrégés (distribution par feature) toujours calculables
//
// Politique par défaut (configurable via env) :
//   AiInvocation ≥ 90j     → anonymise userId/ticketId/orgId/response/humanEdit
//   AiMemory pending ≥ 180j → anonymise content, garde category + source
//   AiMemory rejected ≥ 30j → anonymise content
//   AiMemory verified      → JAMAIS (validée par humain, restera)
//   SimilarTicketClick ≥ 180j → anonymise user/ticket FKs, garde score/bucket
//   AiPattern expiré       → DELETE (c'est une règle apprise, pas de la donnée
//                            identifiante ; la garde n'a pas de valeur)
//
// **DÉSACTIVÉ PAR DÉFAUT** : requiert `ENABLE_AI_RETENTION_ANONYMIZE=1` pour
// tourner en prod. Tests manuels recommandés via `runAnonymizationDryRun()`
// avant d'activer.
// ============================================================================

import prisma from "@/lib/prisma";

const BATCH_SIZE = 1000;

function days(envKey: string, fallback: number): number {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function dateNDaysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export interface AnonymizeStats {
  invocationsAnonymized: number;
  memoriesRejectedAnonymized: number;
  memoriesPendingAnonymized: number;
  similarClicksAnonymized: number;
  expiredPatternsDeleted: number;
}

// ----------------------------------------------------------------------------
// Helpers purs (testables unitaire) — produisent les UPDATE data d'une row
// anonymisée à partir des champs actuels. Exportés pour tests.
// ----------------------------------------------------------------------------

/**
 * Retourne les champs à UPDATE pour anonymiser une invocation. Les champs
 * stats (feature, costCents, tokens, latencyMs, status, createdAt) restent
 * intacts. Les champs identifiants + contenu sont nullés.
 *
 * Convention : `response` remplacée par un marqueur "[anonymized:<date>]"
 * pour que les consulteurs savent qu'il y avait du contenu mais qu'il a été
 * retiré (plutôt que juste null, qui pourrait être ambigu avec un échec).
 */
export function anonymizeInvocationFields(): Record<string, unknown> {
  const marker = `[anonymized:${new Date().toISOString().slice(0, 10)}]`;
  return {
    userId: null,
    ticketId: null,
    organizationId: null,
    response: marker,
    humanEdit: null,
    promptHash: null, // le hash peut révéler le prompt original via replay
  };
}

/**
 * Anonymise une AiMemory. On garde category + source (stats), on strippe le
 * contenu et on dés-associe l'org scope.
 */
export function anonymizeMemoryFields(): Record<string, unknown> {
  const marker = `[anonymized:${new Date().toISOString().slice(0, 10)}]`;
  return {
    content: marker,
    scope: "anonymized",
    rejectedAt: null, // on ne sait plus quand c'était pending/rejected
  };
}

/**
 * Anonymise un SimilarTicketClick. On garde bucket + score + dwellMs pour
 * l'analyse de qualité CTR, on strippe les IDs qui pointent vers des
 * tickets/users.
 */
export function anonymizeClickFields(): Record<string, unknown> {
  return {
    userId: null,
    sourceTicketId: "anonymized",
    clickedTicketId: "anonymized",
    matchedTokens: [],
  };
}

// ----------------------------------------------------------------------------
// Job principal
// ----------------------------------------------------------------------------

/**
 * Execute l'anonymisation sur les rows périmées. Rate-limited par BATCH_SIZE
 * pour éviter un lock long sur les tables. Retourne les compteurs par table.
 *
 * Safe à appeler plusieurs fois (idempotent) — un row déjà anonymisé a ses
 * champs identifiants null et ne matche plus les filters WHERE.
 */
export async function anonymizeExpiredAiData(): Promise<AnonymizeStats> {
  const stats: AnonymizeStats = {
    invocationsAnonymized: 0,
    memoriesRejectedAnonymized: 0,
    memoriesPendingAnonymized: 0,
    similarClicksAnonymized: 0,
    expiredPatternsDeleted: 0,
  };

  // -- AiInvocation ≥ TTL_DAYS ---------------------------------------------
  // Filter : createdAt ancien ET au moins un champ identifiant encore présent
  // (userId OR ticketId OR organizationId OR response != marker) — évite de
  // re-anonymiser des rows déjà traitées.
  const invocationCutoff = dateNDaysAgo(
    days("AI_INVOCATION_RETENTION_DAYS", 90),
  );
  try {
    stats.invocationsAnonymized = await updateInBatches(
      () =>
        prisma.aiInvocation.findMany({
          where: {
            createdAt: { lt: invocationCutoff },
            OR: [
              { userId: { not: null } },
              { ticketId: { not: null } },
              { organizationId: { not: null } },
              { humanEdit: { not: null } },
            ],
          },
          select: { id: true },
          take: BATCH_SIZE,
        }),
      (ids) =>
        prisma.aiInvocation.updateMany({
          where: { id: { in: ids } },
          data: anonymizeInvocationFields(),
        }),
    );
  } catch (err) {
    console.warn("[retention-anonymize] AiInvocation failed:", err);
  }

  // -- AiMemory rejetée ≥ 30j ----------------------------------------------
  const rejectedCutoff = dateNDaysAgo(
    days("AI_MEMORY_REJECTED_RETENTION_DAYS", 30),
  );
  try {
    stats.memoriesRejectedAnonymized = await updateInBatches(
      () =>
        prisma.aiMemory.findMany({
          where: {
            rejectedAt: { not: null, lt: rejectedCutoff },
            NOT: { scope: "anonymized" },
          },
          select: { id: true },
          take: BATCH_SIZE,
        }),
      (ids) =>
        prisma.aiMemory.updateMany({
          where: { id: { in: ids } },
          data: anonymizeMemoryFields(),
        }),
    );
  } catch (err) {
    console.warn("[retention-anonymize] AiMemory rejected failed:", err);
  }

  // -- AiMemory pending (ni verified ni rejected) ≥ 180j -------------------
  const pendingCutoff = dateNDaysAgo(
    days("AI_MEMORY_PENDING_RETENTION_DAYS", 180),
  );
  try {
    stats.memoriesPendingAnonymized = await updateInBatches(
      () =>
        prisma.aiMemory.findMany({
          where: {
            verifiedAt: null,
            rejectedAt: null,
            createdAt: { lt: pendingCutoff },
            NOT: { scope: "anonymized" },
          },
          select: { id: true },
          take: BATCH_SIZE,
        }),
      (ids) =>
        prisma.aiMemory.updateMany({
          where: { id: { in: ids } },
          data: anonymizeMemoryFields(),
        }),
    );
  } catch (err) {
    console.warn("[retention-anonymize] AiMemory pending failed:", err);
  }

  // -- SimilarTicketClick ≥ 180j -------------------------------------------
  const clickCutoff = dateNDaysAgo(days("AI_CLICK_RETENTION_DAYS", 180));
  try {
    stats.similarClicksAnonymized = await updateInBatches(
      () =>
        prisma.similarTicketClick.findMany({
          where: {
            createdAt: { lt: clickCutoff },
            NOT: { sourceTicketId: "anonymized" },
          },
          select: { id: true },
          take: BATCH_SIZE,
        }),
      (ids) =>
        prisma.similarTicketClick.updateMany({
          where: { id: { in: ids } },
          data: anonymizeClickFields(),
        }),
    );
  } catch (err) {
    console.warn("[retention-anonymize] SimilarTicketClick failed:", err);
  }

  // -- AiPattern expirés : DELETE --------------------------------------------
  // Exception : les patterns expirés sont de la donnée APPRISE (règle),
  // pas de la donnée CLIENT. Les garder anonymisés n'a aucun intérêt
  // statistique. Safe à supprimer.
  try {
    const res = await prisma.aiPattern.deleteMany({
      where: { expiresAt: { not: null, lt: new Date() } },
    });
    stats.expiredPatternsDeleted = res.count;
  } catch (err) {
    console.warn("[retention-anonymize] AiPattern expired failed:", err);
  }

  const total =
    stats.invocationsAnonymized +
    stats.memoriesRejectedAnonymized +
    stats.memoriesPendingAnonymized +
    stats.similarClicksAnonymized +
    stats.expiredPatternsDeleted;

  if (total > 0) {
    console.log(
      `[retention-anonymize] ${total} row(s) traitées :`,
      JSON.stringify(stats),
    );
    // Trace dans AuditLog pour conformité CAI.
    try {
      await prisma.auditLog.create({
        data: {
          action: "ai.retention_anonymize",
          entityType: "AiInvocation",
          entityId: "batch",
          metadata: stats as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    } catch {
      /* non bloquant */
    }
  }

  return stats;
}

/**
 * Dry-run : compte les rows qui SERAIENT anonymisées sans rien modifier.
 * À appeler avant d'activer le job en prod pour valider le volume.
 */
export async function runAnonymizationDryRun(): Promise<AnonymizeStats> {
  const invocationCutoff = dateNDaysAgo(
    days("AI_INVOCATION_RETENTION_DAYS", 90),
  );
  const rejectedCutoff = dateNDaysAgo(
    days("AI_MEMORY_REJECTED_RETENTION_DAYS", 30),
  );
  const pendingCutoff = dateNDaysAgo(
    days("AI_MEMORY_PENDING_RETENTION_DAYS", 180),
  );
  const clickCutoff = dateNDaysAgo(days("AI_CLICK_RETENTION_DAYS", 180));

  const [invocations, memoriesRejected, memoriesPending, clicks, patterns] =
    await Promise.all([
      prisma.aiInvocation.count({
        where: {
          createdAt: { lt: invocationCutoff },
          OR: [
            { userId: { not: null } },
            { ticketId: { not: null } },
            { organizationId: { not: null } },
            { humanEdit: { not: null } },
          ],
        },
      }),
      prisma.aiMemory.count({
        where: {
          rejectedAt: { not: null, lt: rejectedCutoff },
          NOT: { scope: "anonymized" },
        },
      }),
      prisma.aiMemory.count({
        where: {
          verifiedAt: null,
          rejectedAt: null,
          createdAt: { lt: pendingCutoff },
          NOT: { scope: "anonymized" },
        },
      }),
      prisma.similarTicketClick.count({
        where: {
          createdAt: { lt: clickCutoff },
          NOT: { sourceTicketId: "anonymized" },
        },
      }),
      prisma.aiPattern.count({
        where: { expiresAt: { not: null, lt: new Date() } },
      }),
    ]);

  return {
    invocationsAnonymized: invocations,
    memoriesRejectedAnonymized: memoriesRejected,
    memoriesPendingAnonymized: memoriesPending,
    similarClicksAnonymized: clicks,
    expiredPatternsDeleted: patterns,
  };
}

/**
 * Traite des rows par lots de BATCH_SIZE. Idempotent. Cap absolu de 50
 * batches par run (= 50k rows max) pour éviter un job qui s'éternise.
 */
async function updateInBatches(
  findNext: () => Promise<Array<{ id: string }>>,
  update: (ids: string[]) => Promise<{ count: number }>,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < 50; i++) {
    const batch = await findNext();
    if (batch.length === 0) break;
    const ids = batch.map((r) => r.id);
    const res = await update(ids);
    total += res.count;
    if (batch.length < BATCH_SIZE) break;
  }
  return total;
}
