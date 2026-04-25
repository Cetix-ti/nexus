import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { isBillable } from "@/lib/billing/coverage-statuses";

/**
 * GET /api/v1/my-space?days=30
 *
 * Returns all personal data for the current user:
 * - Profile info
 * - Time entry stats (hours, revenue, billable rate)
 * - Recent time entries
 * - Expense reports
 * - Purchase orders
 * - Ticket stats (assigned, resolved, created)
 * - Monthly breakdown
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  try {
    const [
      user,
      timeEntries,
      timeEntries12m,
      assignedOpen,
      resolvedInPeriod,
      createdInPeriod,
      expenseReports,
      purchaseOrders,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: me.id },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true, role: true, createdAt: true },
      }),
      prisma.timeEntry.findMany({
        where: { agentId: me.id, startedAt: { gte: since } },
        orderBy: { startedAt: "desc" },
        take: 500,
      }),
      prisma.timeEntry.findMany({
        where: { agentId: me.id, startedAt: { gte: twelveMonthsAgo } },
        select: { startedAt: true, durationMinutes: true, amount: true, coverageStatus: true },
      }),
      prisma.ticket.count({
        where: { assigneeId: me.id, status: { in: ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "WAITING_CLIENT"] } },
      }),
      prisma.ticket.count({
        where: { assigneeId: me.id, resolvedAt: { gte: since } },
      }),
      prisma.ticket.count({
        where: { creatorId: me.id, createdAt: { gte: since } },
      }),
      prisma.expenseReport.findMany({
        where: { submitterId: me.id },
        include: { entries: { select: { id: true, amount: true, category: true, isBillable: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.purchaseOrder.findMany({
        where: { requestedById: me.id },
        include: {
          organization: { select: { name: true } },
          items: { select: { id: true, totalPrice: true, receivedQty: true, quantity: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    // Time entry KPIs
    const totalMinutes = timeEntries.reduce((s, e) => s + e.durationMinutes, 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
    const totalRevenue = timeEntries.reduce((s, e) => s + (e.amount ?? 0), 0);

    const billableMinutes = timeEntries.filter((e) => isBillable(e.coverageStatus)).reduce((s, e) => s + e.durationMinutes, 0);
    const billableHours = Math.round((billableMinutes / 60) * 100) / 100;
    const billableRate = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;

    const onsiteMinutes = timeEntries.filter((e) => e.isOnsite).reduce((s, e) => s + e.durationMinutes, 0);
    const onsiteHours = Math.round((onsiteMinutes / 60) * 100) / 100;
    const afterHoursMinutes = timeEntries.filter((e) => e.isAfterHours).reduce((s, e) => s + e.durationMinutes, 0);
    const afterHoursHours = Math.round((afterHoursMinutes / 60) * 100) / 100;

    const avgHourlyRate = billableHours > 0
      ? Math.round((timeEntries.filter((e) => isBillable(e.coverageStatus)).reduce((s, e) => s + (e.amount ?? 0), 0) / billableHours) * 100) / 100
      : 0;

    // Monthly breakdown (12 months)
    const monthlyMap = new Map<string, { hours: number; revenue: number; billableHours: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      monthlyMap.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, { hours: 0, revenue: 0, billableHours: 0 });
    }
    for (const e of timeEntries12m) {
      const d = new Date(e.startedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthlyMap.get(key);
      if (entry) {
        entry.hours += e.durationMinutes / 60;
        entry.revenue += e.amount ?? 0;
        if (isBillable(e.coverageStatus)) entry.billableHours += e.durationMinutes / 60;
      }
    }

    // Coverage breakdown
    const coverageMap = new Map<string, { minutes: number; revenue: number }>();
    for (const e of timeEntries) {
      const s = e.coverageStatus || "pending";
      const c = coverageMap.get(s) || { minutes: 0, revenue: 0 };
      c.minutes += e.durationMinutes;
      c.revenue += e.amount ?? 0;
      coverageMap.set(s, c);
    }

    // Top orgs by time
    const orgTimeMap = new Map<string, { orgId: string; minutes: number; revenue: number }>();
    for (const e of timeEntries) {
      const o = orgTimeMap.get(e.organizationId) || { orgId: e.organizationId, minutes: 0, revenue: 0 };
      o.minutes += e.durationMinutes;
      o.revenue += e.amount ?? 0;
      orgTimeMap.set(e.organizationId, o);
    }
    const orgIds = [...orgTimeMap.keys()];
    const orgs = orgIds.length
      ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
      : [];
    const orgNameMap = new Map(orgs.map((o) => [o.id, o.name]));

    // Recent time entries (last 20)
    const recentEntries = timeEntries.slice(0, 20);
    const ticketIds = [...new Set(recentEntries.map((e) => e.ticketId))];
    const tickets = ticketIds.length
      ? await prisma.ticket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, number: true, subject: true } })
      : [];
    const ticketMap = new Map(tickets.map((t) => [t.id, t]));

    return NextResponse.json({
      user: {
        ...user,
        createdAt: user?.createdAt.toISOString(),
      },
      period: { days, since: since.toISOString() },
      kpis: {
        totalHours, billableHours, billableRate, totalRevenue: Math.round(totalRevenue * 100) / 100,
        avgHourlyRate, onsiteHours, afterHoursHours,
        assignedOpen, resolvedInPeriod, createdInPeriod,
      },
      monthlyBreakdown: Array.from(monthlyMap.entries()).map(([month, d]) => ({
        month,
        hours: Math.round(d.hours * 100) / 100,
        revenue: Math.round(d.revenue * 100) / 100,
        billableHours: Math.round(d.billableHours * 100) / 100,
      })),
      coverageBreakdown: Array.from(coverageMap.entries()).map(([status, d]) => ({
        status,
        hours: Math.round((d.minutes / 60) * 100) / 100,
        revenue: Math.round(d.revenue * 100) / 100,
      })).sort((a, b) => b.hours - a.hours),
      topOrgs: Array.from(orgTimeMap.values())
        .map((o) => ({
          organizationId: o.orgId,
          organizationName: orgNameMap.get(o.orgId) ?? "Inconnu",
          hours: Math.round((o.minutes / 60) * 100) / 100,
          revenue: Math.round(o.revenue * 100) / 100,
        }))
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 10),
      recentTimeEntries: recentEntries.map((e) => {
        const t = ticketMap.get(e.ticketId);
        return {
          id: e.id,
          date: e.startedAt.toISOString(),
          ticketNumber: t?.number ?? 0,
          ticketSubject: t?.subject ?? "—",
          ticketId: e.ticketId,
          durationMinutes: e.durationMinutes,
          amount: e.amount,
          coverageStatus: e.coverageStatus,
          isOnsite: e.isOnsite,
          isAfterHours: e.isAfterHours,
          description: e.description,
        };
      }),
      expenseReports: expenseReports.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        totalAmount: r.totalAmount,
        entryCount: r.entries.length,
        billableAmount: r.entries.filter((e) => e.isBillable).reduce((s, e) => s + e.amount, 0),
        categories: [...new Set(r.entries.map((e) => e.category))],
        periodStart: r.periodStart?.toISOString() ?? null,
        periodEnd: r.periodEnd?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      purchaseOrders: purchaseOrders.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        title: po.title,
        status: po.status,
        vendorName: po.vendorName,
        organizationName: po.organization?.name ?? null,
        totalAmount: po.totalAmount,
        itemCount: po.items.length,
        receivedCount: po.items.filter((i) => i.receivedQty >= i.quantity).length,
        expectedDate: po.expectedDate?.toISOString() ?? null,
        createdAt: po.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}
