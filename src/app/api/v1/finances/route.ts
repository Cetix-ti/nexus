import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Number(searchParams.get("days")) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Previous period for comparison
    const prevStart = new Date(since);
    prevStart.setDate(prevStart.getDate() - days);

    const [
      // Current period
      timeEntries,
      prevTimeEntries,
      // Contracts
      activeContracts,
      // Orgs with tickets
      orgTicketCounts,
    ] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { startedAt: { gte: since } },
        select: {
          durationMinutes: true,
          coverageStatus: true,
          hourlyRate: true,
          amount: true,
          organizationId: true,
          isOnsite: true,
          isAfterHours: true,
        },
      }),
      prisma.timeEntry.findMany({
        where: { startedAt: { gte: prevStart, lt: since } },
        select: { durationMinutes: true, amount: true, coverageStatus: true },
      }),
      prisma.contract.findMany({
        where: { status: "ACTIVE" },
        include: { organization: { select: { name: true } } },
      }),
      prisma.ticket.groupBy({
        by: ["organizationId"],
        where: { createdAt: { gte: since } },
        _count: true,
      }),
    ]);

    // Calculate KPIs
    const totalMinutes = timeEntries.reduce((s, e) => s + e.durationMinutes, 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

    const billableEntries = timeEntries.filter((e) =>
      ["billable", "hour_bank_overage", "msp_overage", "travel_billable"].includes(e.coverageStatus),
    );
    const billableMinutes = billableEntries.reduce((s, e) => s + e.durationMinutes, 0);
    const billableHours = Math.round(billableMinutes / 60 * 10) / 10;

    const totalRevenue = timeEntries
      .filter((e) => e.amount != null && e.amount > 0)
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    const prevRevenue = prevTimeEntries
      .filter((e) => e.amount != null && e.amount > 0)
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    const prevHours = Math.round(
      prevTimeEntries.reduce((s, e) => s + e.durationMinutes, 0) / 60 * 10,
    ) / 10;

    const revenueTrend = prevRevenue > 0
      ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100)
      : 0;

    const includedMinutes = timeEntries
      .filter((e) => ["included_in_contract", "hour_bank"].includes(e.coverageStatus))
      .reduce((s, e) => s + e.durationMinutes, 0);
    const includedHours = Math.round(includedMinutes / 60 * 10) / 10;

    const nonBillableMinutes = timeEntries
      .filter((e) => ["non_billable", "pending"].includes(e.coverageStatus))
      .reduce((s, e) => s + e.durationMinutes, 0);
    const nonBillableHours = Math.round(nonBillableMinutes / 60 * 10) / 10;

    const onsiteEntries = timeEntries.filter((e) => e.isOnsite);
    const onsiteRevenue = onsiteEntries
      .filter((e) => e.amount != null)
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    const afterHoursEntries = timeEntries.filter((e) => e.isAfterHours);
    const afterHoursRevenue = afterHoursEntries
      .filter((e) => e.amount != null)
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    // Revenue by organization
    const revenueByOrg = new Map<string, { revenue: number; hours: number }>();
    for (const e of timeEntries) {
      const key = e.organizationId;
      if (!revenueByOrg.has(key)) revenueByOrg.set(key, { revenue: 0, hours: 0 });
      const entry = revenueByOrg.get(key)!;
      entry.revenue += e.amount ?? 0;
      entry.hours += e.durationMinutes / 60;
    }

    // Resolve org names
    const orgIds = [...revenueByOrg.keys()];
    const orgs = orgIds.length
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [];
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

    const revenueByOrgList = Array.from(revenueByOrg.entries())
      .map(([orgId, data]) => ({
        organizationId: orgId,
        organizationName: orgMap.get(orgId) ?? "Inconnu",
        revenue: Math.round(data.revenue * 100) / 100,
        hours: Math.round(data.hours * 10) / 10,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    // Coverage breakdown
    const coverageBreakdown: Record<string, { hours: number; revenue: number }> = {};
    for (const e of timeEntries) {
      if (!coverageBreakdown[e.coverageStatus]) {
        coverageBreakdown[e.coverageStatus] = { hours: 0, revenue: 0 };
      }
      coverageBreakdown[e.coverageStatus].hours += e.durationMinutes / 60;
      coverageBreakdown[e.coverageStatus].revenue += e.amount ?? 0;
    }

    // Monthly revenue projection based on active contracts
    const monthlyContractValue = activeContracts.reduce((s, c) => {
      const mv = (c.monthlyHours ?? 0) * (c.hourlyRate ?? 0); if (mv > 0) return s + mv;
      return s;
    }, 0);

    // Average daily revenue for projection
    const avgDailyRevenue = days > 0 ? totalRevenue / days : 0;
    const projectedMonthlyRevenue = Math.round(avgDailyRevenue * 30 * 100) / 100;

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      kpis: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        prevRevenue: Math.round(prevRevenue * 100) / 100,
        revenueTrend,
        totalHours,
        prevHours,
        billableHours,
        includedHours,
        nonBillableHours,
        billableRate: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
        onsiteRevenue: Math.round(onsiteRevenue * 100) / 100,
        afterHoursRevenue: Math.round(afterHoursRevenue * 100) / 100,
        activeContractsCount: activeContracts.length,
        monthlyContractValue: Math.round(monthlyContractValue * 100) / 100,
        projectedMonthlyRevenue,
      },
      revenueByOrg: revenueByOrgList,
      coverageBreakdown: Object.entries(coverageBreakdown).map(([status, data]) => ({
        status,
        hours: Math.round(data.hours * 10) / 10,
        revenue: Math.round(data.revenue * 100) / 100,
      })),
      contracts: activeContracts.map((c) => ({
        id: c.id,
        name: c.name,
        organizationName: c.organization?.name ?? "?",
        type: c.type,
        status: c.status,
        monthlyValue: (c.monthlyHours ?? 0) * (c.hourlyRate ?? 0) || null,
        startDate: c.startDate?.toISOString() ?? null,
        endDate: c.endDate?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
