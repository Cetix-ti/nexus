import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * GET /api/v1/reports/global?days=30
 *
 * Comprehensive global reports data combining tickets, time entries,
 * finances, and contracts for the entire MSP.
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  // Optionnel : filtre organisation. Quand fourni, toutes les requêtes
  // (tickets, time entries, contrats) sont scopées à cette organisation.
  // Utilisé quand un dashboard est consulté dans le contexte d'une org
  // (atelier ou onglet Rapports d'org).
  const organizationId = url.searchParams.get("organizationId") || null;
  const orgWhere = organizationId ? { organizationId } : {};

  const since = new Date();
  since.setDate(since.getDate() - days);

  const prevStart = new Date(since);
  prevStart.setDate(prevStart.getDate() - days);

  // 12 months for trends
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  try {
    const [
      totalTickets,
      createdInPeriod,
      resolvedInPeriod,
      openTickets,
      slaBreached,
      ticketsByStatus,
      ticketsByPriority,
      ticketsByType,
      ticketsByOrg,
      techResolved,
      timeEntries,
      prevTimeEntries,
      timeEntries12m,
      activeContracts,
      ticketsResolved,
    ] = await Promise.all([
      prisma.ticket.count({ where: { ...orgWhere } }),
      prisma.ticket.count({ where: { ...orgWhere, createdAt: { gte: since } } }),
      prisma.ticket.count({ where: { ...orgWhere, resolvedAt: { gte: since } } }),
      prisma.ticket.count({
        where: { ...orgWhere, status: { in: ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "WAITING_CLIENT"] } },
      }),
      prisma.ticket.count({ where: { ...orgWhere, slaBreached: true, createdAt: { gte: since } } }),
      prisma.ticket.groupBy({ by: ["status"], where: { ...orgWhere, createdAt: { gte: since } }, _count: true }),
      prisma.ticket.groupBy({ by: ["priority"], where: { ...orgWhere, createdAt: { gte: since } }, _count: true }),
      prisma.ticket.groupBy({ by: ["type"], where: { ...orgWhere, createdAt: { gte: since } }, _count: true }),
      prisma.ticket.groupBy({
        by: ["organizationId"],
        where: { ...orgWhere, createdAt: { gte: since } },
        _count: true,
        orderBy: { _count: { organizationId: "desc" } },
        take: 15,
      }),
      prisma.ticket.groupBy({
        by: ["assigneeId"],
        where: { ...orgWhere, resolvedAt: { gte: since }, assigneeId: { not: null } },
        _count: true,
        orderBy: { _count: { assigneeId: "desc" } },
        take: 15,
      }),
      prisma.timeEntry.findMany({
        where: { ...orgWhere, startedAt: { gte: since } },
        select: {
          startedAt: true,
          durationMinutes: true, coverageStatus: true, hourlyRate: true, amount: true,
          organizationId: true, agentId: true, isOnsite: true, isAfterHours: true,
          isWeekend: true, isUrgent: true, ticketId: true,
        },
      }),
      prisma.timeEntry.findMany({
        where: { ...orgWhere, startedAt: { gte: prevStart, lt: since } },
        select: { durationMinutes: true, amount: true },
      }),
      prisma.timeEntry.findMany({
        where: { ...orgWhere, startedAt: { gte: twelveMonthsAgo } },
        select: {
          startedAt: true, durationMinutes: true, amount: true,
          coverageStatus: true, organizationId: true, agentId: true,
        },
      }),
      prisma.contract.findMany({
        where: { ...orgWhere, status: "ACTIVE" },
        include: { organization: { select: { name: true } } },
      }),
      prisma.ticket.findMany({
        where: { ...orgWhere, resolvedAt: { not: null, gte: since } },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

    const extractCount = (r: any) =>
      typeof r._count === "number" ? r._count : (r._count as any)?._all ?? 0;

    // ---------- Resolve names ----------
    const orgIds = [...new Set([
      ...ticketsByOrg.map((r) => r.organizationId),
      ...timeEntries.map((e) => e.organizationId),
    ])].filter(Boolean);
    const agentIds = [...new Set([
      ...techResolved.map((r) => r.assigneeId!).filter(Boolean),
      ...timeEntries.map((e) => e.agentId),
    ])].filter(Boolean);

    const [orgs, agents] = await Promise.all([
      orgIds.length ? prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [],
      agentIds.length ? prisma.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, firstName: true, lastName: true, avatar: true } }) : [],
    ]);
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    // ---------- Ticket KPIs ----------
    const slaCompliance = createdInPeriod > 0
      ? Math.round(((createdInPeriod - slaBreached) / createdInPeriod) * 1000) / 10
      : 100;

    const resolutionTimes = ticketsResolved
      .filter((t) => t.resolvedAt)
      .map((t) => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3600000);
    const avgResolutionHours = resolutionTimes.length > 0
      ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) * 10) / 10
      : null;

    // ---------- Financial KPIs ----------
    const totalMinutes = timeEntries.reduce((s, e) => s + e.durationMinutes, 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
    const totalRevenue = timeEntries.reduce((s, e) => s + (e.amount ?? 0), 0);
    const prevRevenue = prevTimeEntries.reduce((s, e) => s + (e.amount ?? 0), 0);
    const prevHours = Math.round(prevTimeEntries.reduce((s, e) => s + e.durationMinutes, 0) / 60 * 100) / 100;
    const revenueTrend = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0;

    const billableStatuses = ["billable", "hour_bank_overage", "msp_overage", "travel_billable"];
    const billableMinutes = timeEntries.filter((e) => billableStatuses.includes(e.coverageStatus)).reduce((s, e) => s + e.durationMinutes, 0);
    const billableHours = Math.round((billableMinutes / 60) * 100) / 100;
    const billableRevenue = timeEntries.filter((e) => billableStatuses.includes(e.coverageStatus)).reduce((s, e) => s + (e.amount ?? 0), 0);
    const billableRate = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;
    const avgHourlyRate = billableHours > 0 ? Math.round((billableRevenue / billableHours) * 100) / 100 : 0;

    const onsiteRevenue = timeEntries.filter((e) => e.isOnsite).reduce((s, e) => s + (e.amount ?? 0), 0);
    const afterHoursRevenue = timeEntries.filter((e) => e.isAfterHours).reduce((s, e) => s + (e.amount ?? 0), 0);
    const onsiteHours = Math.round(timeEntries.filter((e) => e.isOnsite).reduce((s, e) => s + e.durationMinutes, 0) / 60 * 100) / 100;
    const afterHoursHours = Math.round(timeEntries.filter((e) => e.isAfterHours).reduce((s, e) => s + e.durationMinutes, 0) / 60 * 100) / 100;

    // ---------- Monthly trend (12 months) ----------
    const monthlyMap = new Map<string, { hours: number; revenue: number; billableHours: number; tickets: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, { hours: 0, revenue: 0, billableHours: 0, tickets: 0 });
    }
    for (const e of timeEntries12m) {
      const d = new Date(e.startedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthlyMap.get(key);
      if (entry) {
        entry.hours += e.durationMinutes / 60;
        entry.revenue += e.amount ?? 0;
        if (billableStatuses.includes(e.coverageStatus)) entry.billableHours += e.durationMinutes / 60;
      }
    }
    const monthlyBreakdown = Array.from(monthlyMap.entries()).map(([month, d]) => ({
      month,
      hours: Math.round(d.hours * 100) / 100,
      revenue: Math.round(d.revenue * 100) / 100,
      billableHours: Math.round(d.billableHours * 100) / 100,
      billableRate: d.hours > 0 ? Math.round((d.billableHours / d.hours) * 100) : 0,
    }));

    // ---------- Agent breakdown ----------
    const agentTimeMap = new Map<string, { minutes: number; revenue: number; entries: number; resolved: number }>();
    for (const e of timeEntries) {
      const a = agentTimeMap.get(e.agentId) || { minutes: 0, revenue: 0, entries: 0, resolved: 0 };
      a.minutes += e.durationMinutes;
      a.revenue += e.amount ?? 0;
      a.entries += 1;
      agentTimeMap.set(e.agentId, a);
    }
    for (const r of techResolved) {
      const id = r.assigneeId!;
      const a = agentTimeMap.get(id) || { minutes: 0, revenue: 0, entries: 0, resolved: 0 };
      a.resolved = extractCount(r);
      agentTimeMap.set(id, a);
    }
    const agentBreakdown = Array.from(agentTimeMap.entries())
      .map(([id, a]) => {
        const u = agentMap.get(id);
        return {
          agentName: u ? `${u.firstName} ${u.lastName}` : "Inconnu",
          avatar: u?.avatar ?? null,
          hours: Math.round((a.minutes / 60) * 100) / 100,
          revenue: Math.round(a.revenue * 100) / 100,
          entries: a.entries,
          resolved: a.resolved,
        };
      })
      .sort((a, b) => b.hours - a.hours);

    // ---------- Coverage breakdown ----------
    const coverageMap = new Map<string, { minutes: number; revenue: number; count: number }>();
    for (const e of timeEntries) {
      const s = e.coverageStatus || "pending";
      const c = coverageMap.get(s) || { minutes: 0, revenue: 0, count: 0 };
      c.minutes += e.durationMinutes;
      c.revenue += e.amount ?? 0;
      c.count += 1;
      coverageMap.set(s, c);
    }
    const coverageBreakdown = Array.from(coverageMap.entries())
      .map(([status, d]) => ({
        status,
        hours: Math.round((d.minutes / 60) * 100) / 100,
        revenue: Math.round(d.revenue * 100) / 100,
        count: d.count,
      }))
      .sort((a, b) => b.hours - a.hours);

    // ---------- Revenue by org ----------
    const orgRevenueMap = new Map<string, { revenue: number; hours: number; tickets: number }>();
    for (const e of timeEntries) {
      const o = orgRevenueMap.get(e.organizationId) || { revenue: 0, hours: 0, tickets: 0 };
      o.revenue += e.amount ?? 0;
      o.hours += e.durationMinutes / 60;
      orgRevenueMap.set(e.organizationId, o);
    }
    const revenueByOrg = Array.from(orgRevenueMap.entries())
      .map(([id, d]) => ({
        organizationId: id,
        organizationName: orgMap.get(id) ?? "Inconnu",
        revenue: Math.round(d.revenue * 100) / 100,
        hours: Math.round(d.hours * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    // ---------- Top tickets by time ----------
    const ticketTimeMap = new Map<string, { minutes: number; revenue: number }>();
    for (const e of timeEntries) {
      const t = ticketTimeMap.get(e.ticketId) || { minutes: 0, revenue: 0 };
      t.minutes += e.durationMinutes;
      t.revenue += e.amount ?? 0;
      ticketTimeMap.set(e.ticketId, t);
    }
    const topTicketIds = Array.from(ticketTimeMap.entries())
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .slice(0, 10)
      .map(([id]) => id);
    const topTicketDetails = topTicketIds.length > 0
      ? await prisma.ticket.findMany({
          where: { id: { in: topTicketIds } },
          select: { id: true, number: true, subject: true, status: true, organizationId: true },
        })
      : [];
    const ticketDetailMap = new Map(topTicketDetails.map((t) => [t.id, t]));
    const topTickets = topTicketIds.map((id) => {
      const d = ticketTimeMap.get(id)!;
      const t = ticketDetailMap.get(id);
      return {
        ticketNumber: t?.number ?? 0,
        subject: t?.subject ?? "—",
        status: t?.status ?? "unknown",
        organizationName: orgMap.get(t?.organizationId ?? "") ?? "—",
        hours: Math.round((d.minutes / 60) * 100) / 100,
        revenue: Math.round(d.revenue * 100) / 100,
      };
    });

    // ---------- Contract usage ----------
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const contractUsage = activeContracts.map((c) => {
      const monthlyHours = c.monthlyHours ?? 0;
      const monthEntries = timeEntries.filter((e) =>
        e.organizationId === c.organizationId &&
        new Date(e.startedAt) >= monthStart &&
        ["included_in_contract", "hour_bank"].includes(e.coverageStatus),
      );
      const usedMinutes = monthEntries.reduce((s, e) => s + e.durationMinutes, 0);
      const usedHours = Math.round((usedMinutes / 60) * 100) / 100;
      return {
        id: c.id,
        name: c.name,
        organizationName: c.organization?.name ?? "?",
        type: c.type,
        monthlyHours,
        usedHours,
        remainingHours: Math.max(0, monthlyHours - usedHours),
        usagePercent: monthlyHours > 0 ? Math.round((usedHours / monthlyHours) * 100) : 0,
        hourlyRate: c.hourlyRate ?? 0,
      };
    });

    // ---------- Projection ----------
    const avgDailyRevenue = days > 0 ? totalRevenue / days : 0;
    const projectedMonthlyRevenue = Math.round(avgDailyRevenue * 30 * 100) / 100;
    const monthlyContractValue = activeContracts.reduce((s, c) => s + (c.monthlyHours ?? 0) * (c.hourlyRate ?? 0), 0);

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      ticketKpis: {
        totalTickets, createdInPeriod, resolvedInPeriod, openTickets,
        slaBreached, slaCompliance, avgResolutionHours,
      },
      financeKpis: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        prevRevenue: Math.round(prevRevenue * 100) / 100,
        revenueTrend,
        totalHours, prevHours, billableHours, billableRate, avgHourlyRate,
        onsiteHours, afterHoursHours,
        onsiteRevenue: Math.round(onsiteRevenue * 100) / 100,
        afterHoursRevenue: Math.round(afterHoursRevenue * 100) / 100,
        projectedMonthlyRevenue,
        monthlyContractValue: Math.round(monthlyContractValue * 100) / 100,
        activeContractsCount: activeContracts.length,
      },
      ticketStats: {
        byStatus: ticketsByStatus.map((r) => ({ status: r.status, count: extractCount(r) })),
        byPriority: ticketsByPriority.map((r) => ({ priority: r.priority, count: extractCount(r) })),
        byType: ticketsByType.map((r) => ({ type: r.type, count: extractCount(r) })),
        byOrg: ticketsByOrg.map((r) => ({
          organizationId: r.organizationId,
          organizationName: orgMap.get(r.organizationId) ?? "Inconnu",
          count: extractCount(r),
        })),
      },
      monthlyBreakdown,
      agentBreakdown,
      coverageBreakdown,
      revenueByOrg,
      topTickets,
      contractUsage,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
