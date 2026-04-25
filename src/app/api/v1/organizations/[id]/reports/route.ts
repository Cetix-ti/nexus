import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { isBillable, isCovered, isNonBillable } from "@/lib/billing/coverage-statuses";

/**
 * GET /api/v1/organizations/[id]/reports?days=30
 *
 * Returns aggregated report data for a single organization:
 * - Billing KPIs (hours, revenue, rates)
 * - Monthly breakdown (last 12 months)
 * - Agent breakdown
 * - Ticket statistics
 * - Coverage breakdown
 * - SLA compliance (if SLA exists)
 * - Top tickets by time spent
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orgId } = await params;
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "90", 10);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

  // Parallel data fetch
  const [timeEntries, tickets, contracts, allTimeEntries12m] = await Promise.all([
    // Time entries for the selected period
    prisma.timeEntry.findMany({
      where: { organizationId: orgId, startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
    }),
    // Tickets for the selected period
    prisma.ticket.findMany({
      where: { organizationId: orgId, createdAt: { gte: since } },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        type: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
      },
    }),
    // Active contracts
    prisma.contract.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        type: true,
        monthlyHours: true,
        hourlyRate: true,
        startDate: true,
        endDate: true,
      },
    }),
    // 12 months of time entries for monthly trend
    prisma.timeEntry.findMany({
      where: {
        organizationId: orgId,
        startedAt: { gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) },
      },
      select: {
        startedAt: true,
        durationMinutes: true,
        amount: true,
        hourlyRate: true,
        coverageStatus: true,
        isAfterHours: true,
        isOnsite: true,
      },
    }),
  ]);

  // ---------- Billing KPIs ----------
  const totalMinutes = timeEntries.reduce((s, e) => s + e.durationMinutes, 0);
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
  const totalRevenue = timeEntries.reduce((s, e) => s + (e.amount ?? 0), 0);

  const billableEntries = timeEntries.filter((e) => isBillable(e.coverageStatus));
  const billableMinutes = billableEntries.reduce((s, e) => s + e.durationMinutes, 0);
  const billableHours = Math.round((billableMinutes / 60) * 100) / 100;
  const billableRevenue = billableEntries.reduce((s, e) => s + (e.amount ?? 0), 0);

  // "hour_bank" était phantom : la valeur réelle est "deducted_from_hour_bank"
  // assignée par engine.ts, couverte par isCovered().
  const includedEntries = timeEntries.filter((e) => isCovered(e.coverageStatus));
  const includedMinutes = includedEntries.reduce((s, e) => s + e.durationMinutes, 0);
  const includedHours = Math.round((includedMinutes / 60) * 100) / 100;

  // isNonBillable inclut maintenant "internal_time" (était ignoré avant).
  const nonBillableMinutes = timeEntries
    .filter((e) => isNonBillable(e.coverageStatus))
    .reduce((s, e) => s + e.durationMinutes, 0);
  const nonBillableHours = Math.round((nonBillableMinutes / 60) * 100) / 100;

  const billableRate = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;

  const avgHourlyRate = billableHours > 0 ? Math.round((billableRevenue / billableHours) * 100) / 100 : 0;

  const onsiteMinutes = timeEntries.filter((e) => e.isOnsite).reduce((s, e) => s + e.durationMinutes, 0);
  const onsiteHours = Math.round((onsiteMinutes / 60) * 100) / 100;
  const afterHoursMinutes = timeEntries.filter((e) => e.isAfterHours).reduce((s, e) => s + e.durationMinutes, 0);
  const afterHoursHours = Math.round((afterHoursMinutes / 60) * 100) / 100;

  // ---------- Monthly Breakdown (12 months) ----------
  const monthlyMap = new Map<string, { hours: number; revenue: number; billableHours: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, { hours: 0, revenue: 0, billableHours: 0 });
  }

  for (const e of allTimeEntries12m) {
    const d = new Date(e.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(key);
    if (entry) {
      entry.hours += e.durationMinutes / 60;
      entry.revenue += e.amount ?? 0;
      if (isBillable(e.coverageStatus)) {
        entry.billableHours += e.durationMinutes / 60;
      }
    }
  }

  const monthlyBreakdown = Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month,
    hours: Math.round(data.hours * 100) / 100,
    revenue: Math.round(data.revenue * 100) / 100,
    billableHours: Math.round(data.billableHours * 100) / 100,
    billableRate: data.hours > 0 ? Math.round((data.billableHours / data.hours) * 100) : 0,
  }));

  // ---------- Agent Breakdown ----------
  const agentMap = new Map<string, { agentId: string; minutes: number; revenue: number; entries: number }>();
  for (const e of timeEntries) {
    const existing = agentMap.get(e.agentId) || { agentId: e.agentId, minutes: 0, revenue: 0, entries: 0 };
    existing.minutes += e.durationMinutes;
    existing.revenue += e.amount ?? 0;
    existing.entries += 1;
    agentMap.set(e.agentId, existing);
  }

  const agentIds = Array.from(agentMap.keys());
  const agents = agentIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const agentNameMap = new Map(agents.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));

  const agentBreakdown = Array.from(agentMap.values())
    .map((a) => ({
      agentName: agentNameMap.get(a.agentId) || "Inconnu",
      hours: Math.round((a.minutes / 60) * 100) / 100,
      revenue: Math.round(a.revenue * 100) / 100,
      entries: a.entries,
    }))
    .sort((a, b) => b.hours - a.hours);

  // ---------- Coverage Breakdown ----------
  const coverageMap = new Map<string, { minutes: number; revenue: number; count: number }>();
  for (const e of timeEntries) {
    const status = e.coverageStatus || "pending";
    const existing = coverageMap.get(status) || { minutes: 0, revenue: 0, count: 0 };
    existing.minutes += e.durationMinutes;
    existing.revenue += e.amount ?? 0;
    existing.count += 1;
    coverageMap.set(status, existing);
  }

  const coverageBreakdown = Array.from(coverageMap.entries())
    .map(([status, data]) => ({
      status,
      hours: Math.round((data.minutes / 60) * 100) / 100,
      revenue: Math.round(data.revenue * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.hours - a.hours);

  // ---------- Ticket Statistics ----------
  const ticketsByStatus = new Map<string, number>();
  const ticketsByPriority = new Map<string, number>();
  const ticketsByType = new Map<string, number>();
  const resolutionTimes: number[] = [];

  for (const t of tickets) {
    ticketsByStatus.set(t.status, (ticketsByStatus.get(t.status) || 0) + 1);
    ticketsByPriority.set(t.priority, (ticketsByPriority.get(t.priority) || 0) + 1);
    ticketsByType.set(t.type, (ticketsByType.get(t.type) || 0) + 1);
    if (t.resolvedAt) {
      const resMs = new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime();
      resolutionTimes.push(resMs / 3600000); // hours
    }
  }

  const avgResolutionHours = resolutionTimes.length > 0
    ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) * 10) / 10
    : null;

  const medianResolutionHours = resolutionTimes.length > 0
    ? (() => {
        const sorted = [...resolutionTimes].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const val = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        return Math.round(val * 10) / 10;
      })()
    : null;

  // ---------- Top Tickets by Time ----------
  const ticketTimeMap = new Map<string, { ticketId: string; minutes: number; revenue: number }>();
  for (const e of timeEntries) {
    const existing = ticketTimeMap.get(e.ticketId) || { ticketId: e.ticketId, minutes: 0, revenue: 0 };
    existing.minutes += e.durationMinutes;
    existing.revenue += e.amount ?? 0;
    ticketTimeMap.set(e.ticketId, existing);
  }

  const topTicketIds = Array.from(ticketTimeMap.entries())
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 10)
    .map(([id]) => id);

  const topTicketDetails = topTicketIds.length > 0
    ? await prisma.ticket.findMany({
        where: { id: { in: topTicketIds } },
        select: { id: true, number: true, subject: true, status: true },
      })
    : [];
  const ticketDetailMap = new Map(topTicketDetails.map((t) => [t.id, t]));

  const topTickets = topTicketIds.map((id) => {
    const data = ticketTimeMap.get(id)!;
    const detail = ticketDetailMap.get(id);
    return {
      ticketNumber: detail?.number ?? 0,
      subject: detail?.subject ?? "—",
      status: detail?.status ?? "unknown",
      hours: Math.round((data.minutes / 60) * 100) / 100,
      revenue: Math.round(data.revenue * 100) / 100,
    };
  });

  // ---------- Contract usage ----------
  const contractUsage = contracts.map((c) => {
    const monthlyHours = c.monthlyHours ?? 0;
    // Current month's included hours
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEntries = timeEntries.filter((e) => {
      const d = new Date(e.startedAt);
      return d >= monthStart && isCovered(e.coverageStatus);
    });
    const usedMinutes = monthEntries.reduce((s, e) => s + e.durationMinutes, 0);
    const usedHours = Math.round((usedMinutes / 60) * 100) / 100;

    return {
      id: c.id,
      name: c.name,
      type: c.type,
      monthlyHours,
      usedHours,
      remainingHours: Math.max(0, monthlyHours - usedHours),
      usagePercent: monthlyHours > 0 ? Math.round((usedHours / monthlyHours) * 100) : 0,
      hourlyRate: c.hourlyRate ?? 0,
    };
  });

  return NextResponse.json({
    organizationId: orgId,
    organizationName: org.name,
    period: { days, since: since.toISOString() },
    kpis: {
      totalHours,
      billableHours,
      includedHours,
      nonBillableHours,
      billableRate,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      billableRevenue: Math.round(billableRevenue * 100) / 100,
      avgHourlyRate,
      onsiteHours,
      afterHoursHours,
      ticketCount: tickets.length,
      avgResolutionHours,
      medianResolutionHours,
    },
    monthlyBreakdown,
    agentBreakdown,
    coverageBreakdown,
    ticketStats: {
      byStatus: Object.fromEntries(ticketsByStatus),
      byPriority: Object.fromEntries(ticketsByPriority),
      byType: Object.fromEntries(ticketsByType),
    },
    topTickets,
    contractUsage,
  });
}
