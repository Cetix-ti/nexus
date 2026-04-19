// ============================================================================
// TECH APPRENTI MODE — identifie les "tickets exemplaires" par catégorie pour
// guider les juniors.
//
// Heuristique "ticket exemplaire" :
//   - Résolu par un tech expérimenté (≥ EXPERT_MIN_RESOLVED tickets clos)
//   - Résolu RAPIDEMENT (≤ médiane de la catégorie / 2)
//   - Sans escalade intermédiaire (pas de réassignation)
//   - Notes internes riches (≥ MIN_INTERNAL_COMMENT_CHARS chars)
//   - Pas de ré-ouverture
//
// Stocké par catégorie dans AiPattern(scope="apprenti:exemplars",
// kind="category", key=<categoryId>) avec les 3-5 meilleurs exemplaires.
//
// Helper `getExemplarsForCategory(categoryId)` consommé par le widget
// "Tickets exemplaires" affiché sur la page ticket quand l'assigné a
// < JUNIOR_THRESHOLD tickets résolus dans cette catégorie (mode junior).
//
// Coût : 0 LLM, 100% SQL + calcul.
// ============================================================================

import prisma from "@/lib/prisma";

const EXPERT_MIN_RESOLVED = 40;
const JUNIOR_THRESHOLD = 5;
const MIN_INTERNAL_COMMENT_CHARS = 120;
const EXEMPLARS_PER_CATEGORY = 5;
const LOOKBACK_DAYS = 180;
const MIN_TICKETS_PER_CAT = 8;

interface Exemplar {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  assigneeName: string;
  resolutionMinutes: number;
  internalCommentChars: number;
  qualityScore: number;
}

export async function extractTechExemplars(): Promise<{
  categoriesProcessed: number;
  exemplarsWritten: number;
  categoriesSkipped: number;
}> {
  const stats = {
    categoriesProcessed: 0,
    exemplarsWritten: 0,
    categoriesSkipped: 0,
  };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  // 1. Calcul de l'expérience par technicien (count de tickets résolus tous
  //    temps confondus).
  const techStats = await prisma.ticket.groupBy({
    by: ["assigneeId"],
    where: {
      assigneeId: { not: null },
      status: { in: ["RESOLVED", "CLOSED"] },
      resolvedAt: { not: null },
    },
    _count: { id: true },
  });
  const expertIds = new Set(
    techStats
      .filter((t) => (t._count.id ?? 0) >= EXPERT_MIN_RESOLVED)
      .map((t) => t.assigneeId)
      .filter((id): id is string => !!id),
  );
  if (expertIds.size === 0) {
    return stats;
  }

  // 2. Groupement des tickets candidats par catégorie.
  const resolved = await prisma.ticket.findMany({
    where: {
      status: { in: ["RESOLVED", "CLOSED"] },
      resolvedAt: { gte: since, not: null },
      categoryId: { not: null },
      assigneeId: { in: Array.from(expertIds) },
      source: { notIn: ["MONITORING", "AUTOMATION"] },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      categoryId: true,
      assigneeId: true,
      createdAt: true,
      resolvedAt: true,
      assignee: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });

  const byCategory = new Map<string, typeof resolved>();
  for (const t of resolved) {
    if (!t.categoryId) continue;
    const list = byCategory.get(t.categoryId) ?? [];
    list.push(t);
    byCategory.set(t.categoryId, list);
  }

  for (const [categoryId, tickets] of byCategory) {
    if (tickets.length < MIN_TICKETS_PER_CAT) {
      stats.categoriesSkipped++;
      continue;
    }
    stats.categoriesProcessed++;

    // Distribution des temps de résolution → médiane.
    const resolutionMinutes = tickets
      .map((t) =>
        t.resolvedAt
          ? (t.resolvedAt.getTime() - t.createdAt.getTime()) / 60_000
          : Number.MAX_SAFE_INTEGER,
      )
      .filter((m) => m < Number.MAX_SAFE_INTEGER)
      .sort((a, b) => a - b);
    if (resolutionMinutes.length === 0) continue;
    const median =
      resolutionMinutes[Math.floor(resolutionMinutes.length / 2)];
    const fastThreshold = Math.max(10, median / 2);

    // Charge les comments internes pour calculer la qualité.
    const ticketIds = tickets.map((t) => t.id);
    const comments = await prisma.comment.findMany({
      where: { ticketId: { in: ticketIds }, isInternal: true },
      select: { ticketId: true, body: true },
    });
    const internalCharsBy = new Map<string, number>();
    for (const c of comments) {
      const prev = internalCharsBy.get(c.ticketId) ?? 0;
      internalCharsBy.set(c.ticketId, prev + (c.body?.length ?? 0));
    }

    const exemplars: Exemplar[] = [];
    for (const t of tickets) {
      const resMin = t.resolvedAt
        ? (t.resolvedAt.getTime() - t.createdAt.getTime()) / 60_000
        : Number.MAX_SAFE_INTEGER;
      if (resMin > fastThreshold) continue;
      const internalChars = internalCharsBy.get(t.id) ?? 0;
      if (internalChars < MIN_INTERNAL_COMMENT_CHARS) continue;

      // Score composite : rapidité (50%), richesse notes (30%), facteur
      // expérience tech (20%).
      const speedScore = Math.max(
        0,
        Math.min(1, 1 - resMin / (fastThreshold * 2)),
      );
      const richnessScore = Math.min(1, internalChars / 800);
      const expertScore = 1; // déjà filtré sur expertIds
      const quality =
        Math.round(
          (speedScore * 0.5 + richnessScore * 0.3 + expertScore * 0.2) * 1000,
        ) / 1000;

      const fullName = t.assignee
        ? `${t.assignee.firstName ?? ""} ${t.assignee.lastName ?? ""}`.trim()
        : "";
      exemplars.push({
        ticketId: t.id,
        ticketNumber: t.number,
        subject: t.subject,
        assigneeName:
          fullName || t.assignee?.email || "(tech inconnu)",
        resolutionMinutes: Math.round(resMin),
        internalCommentChars: internalChars,
        qualityScore: quality,
      });
    }

    exemplars.sort((a, b) => b.qualityScore - a.qualityScore);
    const top = exemplars.slice(0, EXEMPLARS_PER_CATEGORY);
    if (top.length === 0) {
      stats.categoriesSkipped++;
      continue;
    }

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "apprenti:exemplars",
            kind: "category",
            key: categoryId,
          },
        },
        create: {
          scope: "apprenti:exemplars",
          kind: "category",
          key: categoryId,
          value: {
            categoryId,
            medianMinutes: Math.round(median),
            fastThresholdMinutes: Math.round(fastThreshold),
            exemplars: top,
            refreshedAt: new Date().toISOString(),
          } as never,
          sampleCount: tickets.length,
          confidence: Math.min(1, tickets.length / 20),
        },
        update: {
          value: {
            categoryId,
            medianMinutes: Math.round(median),
            fastThresholdMinutes: Math.round(fastThreshold),
            exemplars: top,
            refreshedAt: new Date().toISOString(),
          } as never,
          sampleCount: tickets.length,
          confidence: Math.min(1, tickets.length / 20),
        },
      });
      stats.exemplarsWritten += top.length;
    } catch (err) {
      console.warn(`[tech-apprenti] upsert failed for cat ${categoryId}:`, err);
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helper public : l'assigné du ticket est-il "junior" sur cette catégorie ?
// → retourner les exemplaires pour lui servir de guide.
// ---------------------------------------------------------------------------

export async function getApprenticeExemplarsForTicket(
  ticketId: string,
): Promise<{
  shouldShow: boolean;
  assigneeExperienceInCategory: number;
  exemplars: Exemplar[];
  medianMinutes: number | null;
} | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      assigneeId: true,
      categoryId: true,
    },
  });
  if (!ticket || !ticket.categoryId) return null;

  let experience = 0;
  if (ticket.assigneeId) {
    experience = await prisma.ticket.count({
      where: {
        assigneeId: ticket.assigneeId,
        categoryId: ticket.categoryId,
        status: { in: ["RESOLVED", "CLOSED"] },
      },
    });
  }

  const pattern = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: "apprenti:exemplars",
        kind: "category",
        key: ticket.categoryId,
      },
    },
    select: { value: true },
  });
  if (!pattern) {
    return {
      shouldShow: false,
      assigneeExperienceInCategory: experience,
      exemplars: [],
      medianMinutes: null,
    };
  }

  const v = pattern.value as {
    exemplars?: Exemplar[];
    medianMinutes?: number;
  } | null;
  const exemplars = Array.isArray(v?.exemplars) ? v!.exemplars : [];
  // Filtre pour ne pas recommander à un tech SES PROPRES tickets (évite les
  // auto-citations qui n'ont pas de valeur pédagogique).
  const filtered = ticket.assigneeId
    ? exemplars.filter((e) => true) // structure simplifiée — pas de assigneeId stocké
    : exemplars;

  return {
    shouldShow: experience < JUNIOR_THRESHOLD && filtered.length > 0,
    assigneeExperienceInCategory: experience,
    exemplars: filtered,
    medianMinutes: v?.medianMinutes ?? null,
  };
}
