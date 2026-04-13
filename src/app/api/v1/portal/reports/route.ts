import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET(_request: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = user.organizationId;
  const perms = user.permissions;

  if (!perms.canAccessPortal || !perms.canSeeReports) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const OPEN = ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "WAITING_CLIENT"];

  // Fetch data in parallel — each section is independently guarded so one failure
  // doesn't take down the entire reports page.
  const [ticketStats, projects, timeEntries, contracts] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: true,
    }).catch(() => []),
    perms.canSeeProjects
      ? prisma.project.findMany({
          where: { organizationId: orgId, isVisibleToClient: true, isArchived: false },
          select: { id: true, status: true, progressPercent: true, isAtRisk: true },
        }).catch(() => [])
      : [],
    (perms.canSeeTimeReports || perms.canSeeBillingReports)
      ? prisma.timeEntry.findMany({
          where: { organizationId: orgId },
          select: { durationMinutes: true, coverageStatus: true, amount: true, approvalStatus: true },
          take: 1000,
        }).catch(() => [])
      : [],
    perms.canSeeHourBankBalance
      ? prisma.contract.findMany({
          where: { organizationId: orgId, status: "ACTIVE", type: { in: ["RETAINER", "HOURLY"] } },
          select: { id: true, name: true, monthlyHours: true },
        }).catch(() => [])
      : [],
  ]);

  const extractCount = (r: any) => typeof r._count === "number" ? r._count : (r._count as any)?._all ?? 0;

  const totalTickets = ticketStats.reduce((s, r) => s + extractCount(r), 0);
  const openTickets = ticketStats.filter((r) => OPEN.includes(r.status)).reduce((s, r) => s + extractCount(r), 0);
  const resolvedTickets = ticketStats.filter((r) => r.status === "RESOLVED").reduce((s, r) => s + extractCount(r), 0);
  const closedTickets = ticketStats.filter((r) => r.status === "CLOSED").reduce((s, r) => s + extractCount(r), 0);

  const reports: Record<string, unknown> = {
    tickets: { total: totalTickets, open: openTickets, resolved: resolvedTickets, closed: closedTickets },
  };

  if (perms.canSeeProjects && projects.length > 0) {
    reports.projects = {
      total: projects.length,
      active: projects.filter((p) => p.status === "active").length,
      atRisk: projects.filter((p) => p.isAtRisk).length,
      completed: projects.filter((p) => p.status === "completed").length,
      averageProgress: projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length) : 0,
    };
  }

  if (perms.canSeeTimeReports && timeEntries.length > 0) {
    const billableStatuses = ["billable", "hour_bank_overage", "msp_overage", "travel_billable"];
    const includedStatuses = ["included_in_contract", "hour_bank"];
    reports.time = {
      totalHours: Math.round(timeEntries.reduce((s, e) => s + e.durationMinutes / 60, 0) * 10) / 10,
      billableHours: Math.round(timeEntries.filter((e) => billableStatuses.includes(e.coverageStatus)).reduce((s, e) => s + e.durationMinutes / 60, 0) * 10) / 10,
      includedHours: Math.round(timeEntries.filter((e) => includedStatuses.includes(e.coverageStatus)).reduce((s, e) => s + e.durationMinutes / 60, 0) * 10) / 10,
    };
  }

  if (perms.canSeeHourBankBalance && contracts.length > 0) {
    // Calculate consumed hours for each hour bank contract
    const contractUsage = contracts.map((c) => {
      const usedMinutes = timeEntries
        .filter((e) => ["included_in_contract", "hour_bank"].includes(e.coverageStatus))
        .reduce((s, e) => s + e.durationMinutes, 0);
      const totalHours = c.monthlyHours ?? 0;
      const consumedHours = Math.round((usedMinutes / 60) * 10) / 10;
      return {
        contractId: c.id,
        contractName: c.name,
        totalHours,
        consumedHours,
        remainingHours: Math.max(0, totalHours - consumedHours),
      };
    });
    reports.hourBanks = contractUsage;
  }

  if (perms.canSeeBillingReports && timeEntries.length > 0) {
    reports.billing = {
      pendingAmount: Math.round(timeEntries.filter((e) => e.amount && e.approvalStatus !== "invoiced").reduce((s, e) => s + (e.amount ?? 0), 0) * 100) / 100,
      invoicedAmount: Math.round(timeEntries.filter((e) => e.approvalStatus === "invoiced").reduce((s, e) => s + (e.amount ?? 0), 0) * 100) / 100,
    };
  }

  return NextResponse.json({
    success: true,
    data: reports,
    meta: { organizationId: orgId, generatedAt: new Date().toISOString() },
  });
}
