// ============================================================================
// GET /api/v1/intelligence/techs/[id]
//
// Vue coaching d'un technicien :
//   - Expertise matrix (workload-optimizer)
//   - Charge courante (open tickets)
//   - Stats résolution 30j
//   - SLA risks assignés au tech
//   - Zones de croissance : catégories où le tech est junior (<5 tickets)
//     mais qui sont des top catégories du MSP → à apprendre
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { getSlaRisksForUser } from "@/lib/ai/jobs/sla-drift-predictor";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [expertisePattern, openLoad, resolved30d, categories, slaRisks] =
    await Promise.all([
      prisma.aiPattern.findUnique({
        where: {
          scope_kind_key: {
            scope: "workload:expertise",
            kind: "tech",
            key: id,
          },
        },
        select: { value: true, lastUpdatedAt: true },
      }),
      prisma.ticket.count({
        where: {
          assigneeId: id,
          status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
        },
      }),
      prisma.ticket.findMany({
        where: {
          assigneeId: id,
          status: { in: ["RESOLVED", "CLOSED"] },
          resolvedAt: {
            gte: new Date(Date.now() - 30 * 24 * 3600_000),
            not: null,
          },
        },
        select: { createdAt: true, resolvedAt: true, categoryId: true },
        take: 1000,
      }),
      prisma.category.findMany({
        select: { id: true, name: true, parentId: true },
      }),
      getSlaRisksForUser(id),
    ]);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const pathOf = (catId: string): string => {
    const parts: string[] = [];
    let cur = byId.get(catId);
    while (cur) {
      parts.unshift(cur.name);
      if (!cur.parentId) break;
      cur = byId.get(cur.parentId);
    }
    return parts.join(" > ");
  };

  interface CategoryExpertise {
    expertise: number;
    resolvedCount: number;
    medianMinutes: number;
  }
  const profile = expertisePattern?.value as {
    byCategory?: Record<string, CategoryExpertise>;
    totalResolved?: number;
  } | null;

  const expertiseList = profile?.byCategory
    ? Object.entries(profile.byCategory)
        .map(([catId, stats]) => ({
          categoryId: catId,
          categoryPath: pathOf(catId),
          expertise: stats.expertise,
          resolvedCount: stats.resolvedCount,
          medianMinutes: stats.medianMinutes,
        }))
        .sort((a, b) => b.expertise - a.expertise)
    : [];

  // Stats 30j
  const resolutionTimes30d = resolved30d
    .filter((t) => t.resolvedAt)
    .map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60_000);
  const avgResolutionMin30d =
    resolutionTimes30d.length > 0
      ? Math.round(
          resolutionTimes30d.reduce((a, b) => a + b, 0) /
            resolutionTimes30d.length,
        )
      : null;

  // Zones de croissance : top 10 catégories par volume global, dans
  // lesquelles ce tech a < 3 tickets résolus (30j). Utile pour suggérer
  // où étendre son expertise.
  const byCategoryGlobal = await prisma.ticket.groupBy({
    by: ["categoryId"],
    where: {
      resolvedAt: {
        gte: new Date(Date.now() - 90 * 24 * 3600_000),
        not: null,
      },
      categoryId: { not: null },
      source: { notIn: ["MONITORING", "AUTOMATION"] },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 30,
  });
  const userCategoryCounts = new Map<string, number>();
  for (const t of resolved30d) {
    if (!t.categoryId) continue;
    userCategoryCounts.set(
      t.categoryId,
      (userCategoryCounts.get(t.categoryId) ?? 0) + 1,
    );
  }
  const growthZones = byCategoryGlobal
    .filter((g) => g.categoryId && (userCategoryCounts.get(g.categoryId) ?? 0) < 3)
    .slice(0, 8)
    .map((g) => ({
      categoryId: g.categoryId!,
      categoryPath: pathOf(g.categoryId!),
      globalVolume: g._count.id ?? 0,
      userResolved30d: userCategoryCounts.get(g.categoryId!) ?? 0,
    }));

  // Tickets currently at risk (recap)
  const slaRisksOut = slaRisks.slice(0, 8).map((r) => ({
    ticketId: r.ticketId,
    ticketNumber: r.ticketNumber,
    subject: r.subject,
    riskScore: r.riskScore,
    reason: r.reasons?.[0] ?? null,
  }));

  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;

  return NextResponse.json({
    user: {
      id: user.id,
      name: fullName,
      email: user.email,
      role: user.role,
    },
    totalResolvedHistoric: profile?.totalResolved ?? 0,
    openLoad,
    resolved30dCount: resolved30d.length,
    avgResolutionMin30d,
    expertiseList,
    growthZones,
    slaRisks: slaRisksOut,
    profileUpdatedAt: expertisePattern?.lastUpdatedAt ?? null,
  });
}
