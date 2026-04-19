// ============================================================================
// IMPLICIT SLA LEARNER — pour les clients SANS SLAPolicy explicite, apprend
// leurs délais historiques effectifs et produit un SLA implicite utilisable
// par le SLA drift predictor, les rapports clients, et le client health score.
//
// Approche : pour chaque organisation avec ≥ MIN_SAMPLES tickets résolus sur
// 180 jours, calcule par priorité :
//   - firstResponse  : p50, p75, p90 (minutes)
//   - resolution     : p50, p75, p90 (minutes)
//
// Le SLA implicite = p75 (représente un engagement "raisonnable" que le tech
// tient 3 fois sur 4 historiquement). p90 = "limite haute" au-delà de laquelle
// le tech sait que c'est inhabituellement long.
//
// Stockage : AiPattern(scope="sla:implicit", kind="org", key=<orgId>).
//
// Pas de LLM. Refresh quotidien.
// ============================================================================

import prisma from "@/lib/prisma";

const LOOKBACK_DAYS = 180;
const MIN_SAMPLES_PER_ORG = 20;
const MIN_SAMPLES_PER_PRIORITY = 5;

interface SlaStats {
  p50: number;
  p75: number;
  p90: number;
  sample: number;
}

interface ImplicitSla {
  organizationId: string;
  sampleSize: number;
  firstResponse: SlaStats | null;
  resolution: SlaStats | null;
  byPriority: Record<
    string,
    { firstResponse: SlaStats | null; resolution: SlaStats | null }
  >;
  hasExplicitSlaPolicy: boolean;
  rebuiltAt: string;
}

export async function learnImplicitSlas(): Promise<{
  orgs: number;
  written: number;
  skipped: number;
}> {
  const stats = { orgs: 0, written: 0, skipped: 0 };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  const orgs = await prisma.organization.findMany({
    where: { isActive: true, isInternal: false },
    select: { id: true },
  });
  stats.orgs = orgs.length;

  for (const org of orgs) {
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId: org.id,
        status: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { gte: since, not: null },
        source: { notIn: ["MONITORING", "AUTOMATION"] },
      },
      select: {
        createdAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        priority: true,
      },
      take: 2000,
    });
    if (tickets.length < MIN_SAMPLES_PER_ORG) {
      stats.skipped++;
      continue;
    }

    const firstResponseMinutes: number[] = [];
    const resolutionMinutes: number[] = [];
    const byPrioFirstResp = new Map<string, number[]>();
    const byPrioResol = new Map<string, number[]>();

    for (const t of tickets) {
      if (t.resolvedAt) {
        const mins = (t.resolvedAt.getTime() - t.createdAt.getTime()) / 60_000;
        if (mins > 0) {
          resolutionMinutes.push(mins);
          const arr = byPrioResol.get(String(t.priority)) ?? [];
          arr.push(mins);
          byPrioResol.set(String(t.priority), arr);
        }
      }
      if (t.firstResponseAt) {
        const mins =
          (t.firstResponseAt.getTime() - t.createdAt.getTime()) / 60_000;
        if (mins > 0 && mins < 60 * 24 * 30) {
          // borne : ignore les > 30j (souvent ticket forgotten)
          firstResponseMinutes.push(mins);
          const arr = byPrioFirstResp.get(String(t.priority)) ?? [];
          arr.push(mins);
          byPrioFirstResp.set(String(t.priority), arr);
        }
      }
    }

    const implicit: ImplicitSla = {
      organizationId: org.id,
      sampleSize: tickets.length,
      firstResponse: percentiles(firstResponseMinutes),
      resolution: percentiles(resolutionMinutes),
      byPriority: {},
      hasExplicitSlaPolicy: false, // renseigné plus bas
      rebuiltAt: new Date().toISOString(),
    };
    const priorities = new Set([
      ...byPrioFirstResp.keys(),
      ...byPrioResol.keys(),
    ]);
    for (const p of priorities) {
      const resp = byPrioFirstResp.get(p) ?? [];
      const resol = byPrioResol.get(p) ?? [];
      implicit.byPriority[p] = {
        firstResponse:
          resp.length >= MIN_SAMPLES_PER_PRIORITY ? percentiles(resp) : null,
        resolution:
          resol.length >= MIN_SAMPLES_PER_PRIORITY ? percentiles(resol) : null,
      };
    }

    // Est-ce que l'org a une SLAPolicy formelle quelque part ?
    const explicit = await prisma.sLAPolicy.findFirst({
      where: { organizationId: org.id, isActive: true },
      select: { id: true },
    });
    implicit.hasExplicitSlaPolicy = !!explicit;

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "sla:implicit",
            kind: "org",
            key: org.id,
          },
        },
        create: {
          scope: "sla:implicit",
          kind: "org",
          key: org.id,
          value: implicit as never,
          sampleCount: tickets.length,
          confidence: Math.min(1, tickets.length / 100),
        },
        update: {
          value: implicit as never,
          sampleCount: tickets.length,
          confidence: Math.min(1, tickets.length / 100),
        },
      });
      stats.written++;
    } catch (err) {
      console.warn(`[implicit-sla] upsert failed for ${org.id}:`, err);
      stats.skipped++;
    }
  }

  return stats;
}

function percentiles(arr: number[]): SlaStats | null {
  if (arr.length < 3) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const p = (n: number) =>
    Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * n))]);
  return {
    p50: p(0.5),
    p75: p(0.75),
    p90: p(0.9),
    sample: arr.length,
  };
}

// ---------------------------------------------------------------------------
// Helper public — consommé par le SLA drift predictor (fallback baseline)
// et par les rapports clients ("SLA effectif 30j").
// ---------------------------------------------------------------------------

export async function getImplicitSlaForOrg(
  organizationId: string,
): Promise<ImplicitSla | null> {
  const row = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: "sla:implicit",
        kind: "org",
        key: organizationId,
      },
    },
    select: { value: true },
  });
  const v = row?.value as Partial<ImplicitSla> | null;
  if (!v || typeof v.organizationId !== "string") return null;
  return v as ImplicitSla;
}
