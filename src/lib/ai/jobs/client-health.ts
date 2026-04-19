// ============================================================================
// CLIENT HEALTH SCORE — agrégat 0-100 de la santé opérationnelle d'un client.
//
// Composantes (pondérations cumulées) :
//   - Ticketing       35%   (volume ouvert, tickets très anciens, SLA breaches)
//   - Security        30%   (incidents OPEN, sévérité, chaînes de corrélation)
//   - Backups         15%   (échecs Veeam récents, coverage)
//   - Responsiveness  10%   (first response time moyen)
//   - Risk trend      10%   (slope des tickets créés vs résolus sur 30j)
//
// Score de base = 100. On SOUSTRAIT des pénalités pour chaque signal
// négatif. Plancher à 0. Le résultat est stocké par client dans
// AiPattern(scope="client:health", kind="score", key=<orgId>) avec
// l'historique (30 derniers snapshots) pour tracer la tendance.
//
// Usage : dashboard admin "vue 360 clients", dashboard client individuel,
// alertes automatiques quand le score chute de ≥15 points en 7 jours.
//
// Pas de LLM — entièrement SQL + calcul. Refresh toutes les 2h.
// ============================================================================

import prisma from "@/lib/prisma";

const WINDOW_30_DAYS_MS = 30 * 24 * 3600_000;
const WINDOW_7_DAYS_MS = 7 * 24 * 3600_000;
const STALE_TICKET_DAYS = 14;
const HISTORY_KEEP = 30;

interface HealthBreakdown {
  ticketing: number;
  security: number;
  backups: number;
  responsiveness: number;
  riskTrend: number;
}

interface HealthSnapshot {
  score: number;
  breakdown: HealthBreakdown;
  signals: {
    openTickets: number;
    staleTickets: number;
    slaBreaches30d: number;
    criticalSecurityOpen: number;
    highSecurityOpen: number;
    veeamFailures7d: number;
    avgFirstResponseHours: number | null;
    createdVsResolvedDelta30d: number;
  };
  evaluatedAt: string;
}

interface HealthRecord {
  current: HealthSnapshot;
  previous7dScore: number | null;
  history: Array<{ at: string; score: number }>;
}

export async function computeClientHealthScores(): Promise<{
  orgs: number;
  snapshots: number;
  degraded: number;
}> {
  const stats = { orgs: 0, snapshots: 0, degraded: 0 };
  const now = Date.now();
  const since30d = new Date(now - WINDOW_30_DAYS_MS);
  const since7d = new Date(now - WINDOW_7_DAYS_MS);

  const orgs = await prisma.organization.findMany({
    where: { isActive: true, isInternal: false },
    select: { id: true, name: true },
  });
  stats.orgs = orgs.length;

  for (const org of orgs) {
    const snapshot = await buildSnapshot(org.id, now, since30d, since7d);
    if (!snapshot) continue;

    // Charge l'historique précédent pour le deltas / trend.
    const existing = await prisma.aiPattern.findUnique({
      where: {
        scope_kind_key: {
          scope: "client:health",
          kind: "score",
          key: org.id,
        },
      },
      select: { value: true },
    });
    const prev = existing?.value as Partial<HealthRecord> | null;
    const history = Array.isArray(prev?.history) ? [...prev!.history] : [];
    const previous7dScore = findScoreAtOrBefore(history, since7d.toISOString());

    // Tronque l'historique et ajoute le point courant.
    history.push({ at: snapshot.evaluatedAt, score: snapshot.score });
    while (history.length > HISTORY_KEEP) history.shift();

    const record: HealthRecord = {
      current: snapshot,
      previous7dScore,
      history,
    };

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "client:health",
            kind: "score",
            key: org.id,
          },
        },
        create: {
          scope: "client:health",
          kind: "score",
          key: org.id,
          value: record as never,
          sampleCount: 1,
          confidence: 1,
        },
        update: {
          value: record as never,
          sampleCount: (existing?.value as { sampleCount?: number })?.sampleCount ?? 1,
        },
      });
      stats.snapshots++;
      if (
        previous7dScore !== null &&
        snapshot.score <= previous7dScore - 15
      ) {
        stats.degraded++;
        console.warn(
          `[client-health] ${org.name} : score chuté de ${previous7dScore} → ${snapshot.score} en 7j`,
        );
      }
    } catch (err) {
      console.warn(
        `[client-health] upsert failed for org ${org.id}:`,
        err,
      );
    }
  }

  return stats;
}

async function buildSnapshot(
  orgId: string,
  now: number,
  since30d: Date,
  since7d: Date,
): Promise<HealthSnapshot | null> {
  // 1. Ticketing
  const staleBefore = new Date(now - STALE_TICKET_DAYS * 24 * 3600_000);
  const [openTickets, staleTickets, slaBreaches] = await Promise.all([
    prisma.ticket.count({
      where: {
        organizationId: orgId,
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
      },
    }),
    prisma.ticket.count({
      where: {
        organizationId: orgId,
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
        createdAt: { lt: staleBefore },
      },
    }),
    prisma.ticket.count({
      where: {
        organizationId: orgId,
        slaBreached: true,
        createdAt: { gte: since30d },
      },
    }),
  ]);

  let ticketingPenalty = 0;
  // Pénalités progressives pour ne pas surpunir les petits clients.
  ticketingPenalty += Math.min(10, Math.floor(openTickets / 15)); // 1 point par 15 ouverts, cap 10
  ticketingPenalty += Math.min(15, staleTickets * 1.5); // tickets vieux = gros coût
  ticketingPenalty += Math.min(10, slaBreaches * 2);

  // 2. Security
  const [criticalSecurityOpen, highSecurityOpen] = await Promise.all([
    prisma.securityIncident.count({
      where: {
        organizationId: orgId,
        status: { in: ["open", "investigating"] },
        severity: "critical",
      },
    }),
    prisma.securityIncident.count({
      where: {
        organizationId: orgId,
        status: { in: ["open", "investigating"] },
        severity: "high",
      },
    }),
  ]);
  let securityPenalty = 0;
  securityPenalty += criticalSecurityOpen * 8;  // critique non-traité = saignement
  securityPenalty += highSecurityOpen * 3;
  securityPenalty = Math.min(30, securityPenalty);

  // 3. Backups — Veeam alerts récents liés à cet org.
  // Pas toujours directement liés à organizationId → on passe par les
  // tickets créés depuis Veeam syncs.
  const veeamFailures7d = await prisma.ticket.count({
    where: {
      organizationId: orgId,
      source: "MONITORING",
      createdAt: { gte: since7d },
      OR: [
        { subject: { contains: "veeam", mode: "insensitive" } },
        { subject: { contains: "backup", mode: "insensitive" } },
        { subject: { contains: "sauvegarde", mode: "insensitive" } },
      ],
    },
  });
  const backupsPenalty = Math.min(15, veeamFailures7d * 1.5);

  // 4. Responsiveness — avg first response time 30d.
  const recent = await prisma.ticket.findMany({
    where: {
      organizationId: orgId,
      createdAt: { gte: since30d },
      firstResponseAt: { not: null },
    },
    select: { createdAt: true, firstResponseAt: true },
    take: 200,
  });
  let avgFirstResponseHours: number | null = null;
  let responsivenessPenalty = 0;
  if (recent.length >= 3) {
    const hours =
      recent.map((r) =>
        r.firstResponseAt
          ? (r.firstResponseAt.getTime() - r.createdAt.getTime()) /
            3600_000
          : 0,
      );
    avgFirstResponseHours =
      Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10;
    if (avgFirstResponseHours > 12) responsivenessPenalty = 10;
    else if (avgFirstResponseHours > 6) responsivenessPenalty = 6;
    else if (avgFirstResponseHours > 3) responsivenessPenalty = 3;
  }

  // 5. Risk trend — delta créés vs résolus sur 30j.
  const [created30d, resolved30d] = await Promise.all([
    prisma.ticket.count({
      where: { organizationId: orgId, createdAt: { gte: since30d } },
    }),
    prisma.ticket.count({
      where: {
        organizationId: orgId,
        resolvedAt: { gte: since30d, not: null },
      },
    }),
  ]);
  const delta = created30d - resolved30d;
  let riskTrendPenalty = 0;
  if (delta > 20) riskTrendPenalty = 10;
  else if (delta > 10) riskTrendPenalty = 6;
  else if (delta > 5) riskTrendPenalty = 3;

  // 6. Assemble.
  const baseline = 100;
  const breakdown: HealthBreakdown = {
    ticketing: -Math.round(ticketingPenalty),
    security: -Math.round(securityPenalty),
    backups: -Math.round(backupsPenalty),
    responsiveness: -Math.round(responsivenessPenalty),
    riskTrend: -Math.round(riskTrendPenalty),
  };
  const score = Math.max(
    0,
    baseline +
      breakdown.ticketing +
      breakdown.security +
      breakdown.backups +
      breakdown.responsiveness +
      breakdown.riskTrend,
  );

  return {
    score,
    breakdown,
    signals: {
      openTickets,
      staleTickets,
      slaBreaches30d: slaBreaches,
      criticalSecurityOpen,
      highSecurityOpen,
      veeamFailures7d,
      avgFirstResponseHours,
      createdVsResolvedDelta30d: delta,
    },
    evaluatedAt: new Date(now).toISOString(),
  };
}

function findScoreAtOrBefore(
  history: Array<{ at: string; score: number }>,
  cutoffIso: string,
): number | null {
  const cutoff = new Date(cutoffIso).getTime();
  // Parcours inverse : trouve le snapshot le plus récent AVANT la date.
  for (let i = history.length - 1; i >= 0; i--) {
    const t = new Date(history[i].at).getTime();
    if (t <= cutoff) return history[i].score;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper public — dashboard 360 clients.
// ---------------------------------------------------------------------------

export async function getAllClientHealthScores(): Promise<
  Array<{
    orgId: string;
    score: number;
    previous7dScore: number | null;
    trend: "up" | "down" | "flat";
    breakdown: HealthBreakdown;
  }>
> {
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "client:health", kind: "score" },
    select: { key: true, value: true },
  });
  const out: Array<{
    orgId: string;
    score: number;
    previous7dScore: number | null;
    trend: "up" | "down" | "flat";
    breakdown: HealthBreakdown;
  }> = [];
  for (const r of rows) {
    const v = r.value as Partial<HealthRecord> | null;
    const current = v?.current;
    if (!current || typeof current.score !== "number") continue;
    const prev = typeof v?.previous7dScore === "number" ? v!.previous7dScore : null;
    let trend: "up" | "down" | "flat" = "flat";
    if (prev !== null) {
      if (current.score > prev + 2) trend = "up";
      else if (current.score < prev - 2) trend = "down";
    }
    out.push({
      orgId: r.key,
      score: current.score,
      previous7dScore: prev,
      trend,
      breakdown: current.breakdown,
    });
  }
  return out.sort((a, b) => a.score - b.score); // pires en premier
}
