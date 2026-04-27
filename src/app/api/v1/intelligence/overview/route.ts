// ============================================================================
// GET /api/v1/intelligence/overview
//
// Agrège les outputs des 26 jobs d'auto-apprentissage en un payload unique
// consommé par la page /intelligence. SUPER_ADMIN uniquement — contient
// des données agrégées sensibles (santé clients, alertes sécurité).
//
// Pas de LLM — uniquement lectures AiPattern.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET() {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    featureHealth,
    kbGaps,
    maintenanceSuggestions,
    clientHealth,
    slaRisks,
    requesterAnomalies,
    budgetUsage,
    dedupClusters,
    securityChains,
    threadRecaps,
    digitalTwinRuns,
    harmfulPatterns,
  ] = await Promise.all([
    prisma.aiPattern.findMany({
      where: { scope: "meta:feature_health", kind: "score" },
      select: { key: true, value: true, lastUpdatedAt: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: "meta:kb_gaps", kind: "category" },
      orderBy: { confidence: "desc" },
      take: 10,
      select: { value: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: "maintenance:suggestion", kind: "item" },
      take: 50,
      select: { value: true, lastUpdatedAt: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: "client:health", kind: "score" },
      select: { key: true, value: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: "sla:risk", kind: "ticket" },
      select: { value: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: "requester:anomaly", kind: "event" },
      orderBy: { lastUpdatedAt: "desc" },
      take: 20,
      select: { value: true, lastUpdatedAt: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: "budget:usage", kind: "daily" },
      orderBy: { lastUpdatedAt: "desc" },
      take: 30,
      select: { key: true, value: true, lastUpdatedAt: true },
    }),
    prisma.aiPattern.count({
      where: { scope: "dedup:cluster", kind: "group" },
    }),
    prisma.aiPattern.count({
      where: { scope: "security:correlation", kind: "chain" },
    }),
    prisma.aiPattern.count({
      where: { scope: "thread:recap", kind: "ticket" },
    }),
    prisma.aiPattern.findMany({
      where: { scope: "meta:digital_twin", kind: "run" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { value: true, createdAt: true },
    }),
    // Patterns flagués harmful par meta-learning → retirés du runtime.
    prisma.aiPattern.count({
      where: {
        value: {
          path: ["metaStatus"],
          equals: "harmful",
        } as never,
      },
    }),
  ]);

  // ── Feature health → liste triée par agreementRate (descending)
  const featureHealthOut = featureHealth
    .map((r) => {
      const v = r.value as {
        agreementRate?: number;
        recentRate7d?: number | null;
        trend?: number | null;
        totalAudits?: number;
      } | null;
      return {
        feature: r.key,
        agreementRate: v?.agreementRate ?? 0,
        recentRate7d: v?.recentRate7d ?? null,
        trend: v?.trend ?? null,
        totalAudits: v?.totalAudits ?? 0,
        evaluatedAt: r.lastUpdatedAt,
      };
    })
    .sort((a, b) => b.totalAudits - a.totalAudits);

  // ── KB gaps
  const kbGapsOut = kbGaps
    .map((r) => r.value as Record<string, unknown>)
    .filter((v) => typeof v?.categoryId === "string");

  // ── Maintenance suggestions (only status=open)
  const maintenanceOut = maintenanceSuggestions
    .map((r) => {
      const v = r.value as {
        status?: string;
        title?: string;
        clientImpact?: string;
        organizationId?: string;
        estimatedEffort?: string;
        rationale?: string;
        suggestionId?: string;
      } | null;
      return v && v.status === "open" ? v : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 10);

  // ── Client health — pires 5 + meilleurs 3 pour dashboard
  const orgIds = clientHealth.map((c) => c.key);
  const orgs =
    orgIds.length > 0
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [];
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
  const clientHealthOut = clientHealth
    .map((r) => {
      const v = r.value as {
        current?: { score?: number; breakdown?: Record<string, number> };
        previous7dScore?: number | null;
      } | null;
      return {
        orgId: r.key,
        orgName: orgNameById.get(r.key) ?? "(inconnu)",
        score: v?.current?.score ?? 100,
        previous7dScore: v?.previous7dScore ?? null,
        breakdown: v?.current?.breakdown ?? null,
      };
    })
    .sort((a, b) => a.score - b.score);

  // ── SLA risks — top 10 par risk score
  const slaRisksOut = slaRisks
    .map((r) => r.value as Record<string, unknown> | null)
    .filter((x): x is Record<string, unknown> => x !== null)
    .sort((a, b) => ((b.riskScore as number) ?? 0) - ((a.riskScore as number) ?? 0))
    .slice(0, 10);

  // ── Requester anomalies — last 24h, high severity first
  const requesterAnomaliesOut = requesterAnomalies
    .map((r) => r.value as Record<string, unknown> | null)
    .filter((x): x is Record<string, unknown> => x !== null)
    .sort((a, b) => {
      const sev: Record<string, number> = { high: 2, medium: 1, low: 0 };
      return (sev[(b.severity as string) ?? "low"] ?? 0) - (sev[(a.severity as string) ?? "low"] ?? 0);
    });

  // ── Budget usage — agrège today's usage par feature (tous orgs)
  const todayKey = new Date().toISOString().slice(0, 10);
  const budgetByFeature = new Map<
    string,
    { usageCents: number; budgetCents: number; pctUsed: number }
  >();
  for (const r of budgetUsage) {
    if (!r.key.startsWith(todayKey)) continue;
    const feature = r.key.split("|")[1];
    if (!feature) continue;
    const v = r.value as {
      estimatedCostCents?: number;
      budgetCents?: number;
      pctUsed?: number;
    } | null;
    if (!v) continue;
    budgetByFeature.set(feature, {
      usageCents: v.estimatedCostCents ?? 0,
      budgetCents: v.budgetCents ?? 0,
      pctUsed: v.pctUsed ?? 0,
    });
  }
  const budgetOut = Array.from(budgetByFeature.entries())
    .map(([feature, stats]) => ({ feature, ...stats }))
    .sort((a, b) => b.pctUsed - a.pctUsed);

  // ── Digital twin — trend accuracy
  const digitalTwinOut = digitalTwinRuns
    .map((r) => {
      const v = r.value as {
        runAt?: string;
        accuracy?: number;
        looseAccuracy?: number;
        sampled?: number;
      } | null;
      return v
        ? {
            runAt: v.runAt ?? r.createdAt.toISOString(),
            accuracy: v.accuracy ?? 0,
            looseAccuracy: v.looseAccuracy ?? 0,
            sampled: v.sampled ?? 0,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .reverse();

  return NextResponse.json({
    featureHealth: featureHealthOut,
    kbGaps: kbGapsOut,
    maintenanceSuggestions: maintenanceOut,
    clientHealth: {
      worst: clientHealthOut.slice(0, 5),
      best: clientHealthOut.slice(-3).reverse(),
      total: clientHealthOut.length,
    },
    slaRisks: slaRisksOut,
    requesterAnomalies: requesterAnomaliesOut,
    budget: budgetOut,
    digitalTwin: digitalTwinOut,
    counts: {
      dedupClusters,
      securityChains,
      threadRecaps,
      harmfulPatterns,
    },
    generatedAt: new Date().toISOString(),
  });
}
