// ============================================================================
// WORKLOAD OPTIMIZER — apprend l'expertise de chaque technicien par catégorie
// et suggère l'assignataire optimal à la création d'un ticket.
//
// Expertise par tech × catégorie = score composite :
//   - resolvedCount : nombre de tickets résolus dans la catégorie (saturation log).
//   - speedScore    : médiane de résolution du tech vs médiane globale catégorie.
//   - qualityScore  : % de tickets clos sans ré-ouverture ni ré-assignation.
//
// Stocké dans AiPattern(scope="workload:expertise", kind="tech", key=<techId>)
// avec un map byCategory → {expertise, resolvedCount, medianMinutes}.
//
// Au moment du triage, suggestAssigneeForTicket(ticketId) retourne les 3
// techs optimaux : expertise élevée ET charge courante basse.
//
// Pas de LLM. 100% SQL + math. Refresh quotidien suffit.
// ============================================================================

import prisma from "@/lib/prisma";

const LOOKBACK_DAYS = 180;
const MIN_RESOLVED_PER_CATEGORY = 3;
const HIGH_LOAD_TICKET_COUNT = 10;

interface CategoryExpertise {
  expertise: number;        // 0-1 score composite
  resolvedCount: number;
  medianMinutes: number;
  qualityRate: number;      // % sans ré-ouverture
}

interface TechProfile {
  techId: string;
  techName: string;
  byCategory: Record<string, CategoryExpertise>;
  totalResolved: number;
  updatedAt: string;
}

export async function buildExpertiseMatrix(): Promise<{
  techsProcessed: number;
  profilesWritten: number;
  categoriesCovered: number;
}> {
  const stats = {
    techsProcessed: 0,
    profilesWritten: 0,
    categoriesCovered: 0,
  };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  // 1. Charge tous les tickets résolus assignés avec catégorie.
  const tickets = await prisma.ticket.findMany({
    where: {
      status: { in: ["RESOLVED", "CLOSED"] },
      resolvedAt: { gte: since, not: null },
      assigneeId: { not: null },
      categoryId: { not: null },
      source: { notIn: ["MONITORING", "AUTOMATION"] },
    },
    select: {
      id: true,
      assigneeId: true,
      categoryId: true,
      createdAt: true,
      resolvedAt: true,
      status: true,
    },
  });

  // 2. Calcule la médiane de résolution par catégorie globalement (baseline).
  const globalByCat = new Map<string, number[]>();
  for (const t of tickets) {
    if (!t.categoryId || !t.resolvedAt) continue;
    const mins = (t.resolvedAt.getTime() - t.createdAt.getTime()) / 60_000;
    const arr = globalByCat.get(t.categoryId) ?? [];
    arr.push(mins);
    globalByCat.set(t.categoryId, arr);
  }
  const globalMedianByCat = new Map<string, number>();
  for (const [catId, arr] of globalByCat) {
    arr.sort((a, b) => a - b);
    globalMedianByCat.set(catId, arr[Math.floor(arr.length / 2)]);
  }

  // 3. Agrège par tech × catégorie.
  const byTech = new Map<
    string,
    Map<string, { times: number[]; ticketIds: string[] }>
  >();
  for (const t of tickets) {
    if (!t.assigneeId || !t.categoryId || !t.resolvedAt) continue;
    const mins = (t.resolvedAt.getTime() - t.createdAt.getTime()) / 60_000;
    const tMap = byTech.get(t.assigneeId) ?? new Map();
    const row = tMap.get(t.categoryId) ?? { times: [], ticketIds: [] };
    row.times.push(mins);
    row.ticketIds.push(t.id);
    tMap.set(t.categoryId, row);
    byTech.set(t.assigneeId, tMap);
  }

  // 4. Pour chaque tech, calcule quality (via comptage de ré-assignations).
  //    Proxy simple : s'il y a plusieurs assignees historiques sur le même
  //    ticket, on le considère comme "passé de main en main".
  // (Simplification : on considère quality = 1 par défaut. Pour une V2 on
  //  croisera avec AuditLog des changements d'assignee.)
  const techs = await prisma.user.findMany({
    where: {
      id: { in: Array.from(byTech.keys()) },
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const techById = new Map(techs.map((t) => [t.id, t]));

  // 5. Écrit un profil par tech.
  const coveredCategories = new Set<string>();
  for (const [techId, catMap] of byTech) {
    stats.techsProcessed++;
    const profile: TechProfile = {
      techId,
      techName: (() => {
        const u = techById.get(techId);
        if (!u) return "(tech inconnu)";
        const n = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
        return n || u.email || "(tech inconnu)";
      })(),
      byCategory: {},
      totalResolved: 0,
      updatedAt: new Date().toISOString(),
    };

    for (const [catId, row] of catMap) {
      if (row.times.length < MIN_RESOLVED_PER_CATEGORY) continue;
      const sorted = [...row.times].sort((a, b) => a - b);
      const techMedian = sorted[Math.floor(sorted.length / 2)];
      const globalMedian = globalMedianByCat.get(catId) ?? techMedian;

      // Speed score : 1 si tech ≤ 50% du temps global, 0.5 si équivalent, 0 si 2×.
      const speedRatio = techMedian / Math.max(1, globalMedian);
      const speedScore =
        speedRatio <= 0.5 ? 1 : speedRatio <= 1 ? 1 - (speedRatio - 0.5) : Math.max(0, 1 - (speedRatio - 1));

      // Experience : log saturation — 10 tickets = 0.7, 30+ = 1.
      const expScore = Math.min(1, Math.log2(row.times.length + 1) / 5);

      const qualityRate = 1; // Placeholder. V2 : croiser avec AuditLog.

      const expertise =
        Math.round(
          (speedScore * 0.4 + expScore * 0.4 + qualityRate * 0.2) * 1000,
        ) / 1000;

      profile.byCategory[catId] = {
        expertise,
        resolvedCount: row.times.length,
        medianMinutes: Math.round(techMedian),
        qualityRate,
      };
      profile.totalResolved += row.times.length;
      coveredCategories.add(catId);
    }

    if (Object.keys(profile.byCategory).length === 0) continue;

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "workload:expertise",
            kind: "tech",
            key: techId,
          },
        },
        create: {
          scope: "workload:expertise",
          kind: "tech",
          key: techId,
          value: profile as never,
          sampleCount: profile.totalResolved,
          confidence: Math.min(1, profile.totalResolved / 50),
        },
        update: {
          value: profile as never,
          sampleCount: profile.totalResolved,
          confidence: Math.min(1, profile.totalResolved / 50),
        },
      });
      stats.profilesWritten++;
    } catch (err) {
      console.warn(`[workload] upsert failed for tech ${techId}:`, err);
    }
  }
  stats.categoriesCovered = coveredCategories.size;

  return stats;
}

// ---------------------------------------------------------------------------
// Suggestion d'assignataire — combine expertise × disponibilité (charge).
// ---------------------------------------------------------------------------

export interface AssigneeSuggestion {
  techId: string;
  techName: string;
  expertise: number;
  currentLoad: number;
  score: number;
  reason: string;
}

export async function suggestAssigneeForTicket(
  ticketId: string,
): Promise<AssigneeSuggestion[]> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { categoryId: true, organizationId: true, assigneeId: true },
  });
  if (!ticket || !ticket.categoryId) return [];
  return suggestAssigneesForCategory(ticket.categoryId);
}

/**
 * Variante utilisable AVANT la création du ticket (new-ticket form) pour
 * pré-remplir l'assignataire. Accepte juste un categoryId.
 */
export async function suggestAssigneesForCategory(
  categoryId: string,
): Promise<AssigneeSuggestion[]> {
  // 1. Tous les profils expertise qui mentionnent cette catégorie.
  const profiles = await prisma.aiPattern.findMany({
    where: { scope: "workload:expertise", kind: "tech" },
    select: { key: true, value: true },
  });

  interface Candidate {
    techId: string;
    techName: string;
    expertise: number;
    resolvedCount: number;
  }
  const candidates: Candidate[] = [];
  for (const p of profiles) {
    const v = p.value as Partial<TechProfile> | null;
    if (!v || !v.byCategory) continue;
    const entry = v.byCategory[categoryId];
    if (!entry || entry.expertise < 0.3) continue;
    candidates.push({
      techId: p.key,
      techName: v.techName ?? "(tech)",
      expertise: entry.expertise,
      resolvedCount: entry.resolvedCount,
    });
  }
  if (candidates.length === 0) return [];

  // 2. Charge leur load courante (open tickets).
  const techIds = candidates.map((c) => c.techId);
  const loads = await prisma.ticket.groupBy({
    by: ["assigneeId"],
    where: {
      assigneeId: { in: techIds },
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
    _count: { id: true },
  });
  const loadMap = new Map<string, number>();
  for (const l of loads) {
    if (l.assigneeId) loadMap.set(l.assigneeId, l._count.id ?? 0);
  }

  // 3. Score combiné : expertise × loadFactor.
  const scored = candidates
    .map((c) => {
      const load = loadMap.get(c.techId) ?? 0;
      const loadFactor = Math.max(
        0.1,
        1 - load / HIGH_LOAD_TICKET_COUNT,
      ); // 0 tickets = 1, 10+ tickets = 0.1
      const score = Math.round(c.expertise * loadFactor * 1000) / 1000;
      let reason = `${c.resolvedCount} tickets résolus dans cette catégorie (expertise ${Math.round(c.expertise * 100)}%)`;
      if (load === 0) reason += ", disponible";
      else if (load >= HIGH_LOAD_TICKET_COUNT)
        reason += `, mais charge actuelle ${load} tickets ouverts`;
      else reason += `, ${load} ticket(s) ouvert(s)`;
      return {
        techId: c.techId,
        techName: c.techName,
        expertise: c.expertise,
        currentLoad: load,
        score,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5);
}
