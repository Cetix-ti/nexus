import { NextRequest, NextResponse } from "next/server";
import { listTickets } from "@/lib/tickets/service";
import { mockProjects } from "@/lib/projects/mock-data";
import { mockTimeEntries } from "@/lib/billing/mock-data";
import { mockContracts } from "@/lib/billing/mock-data";
import { CURRENT_PORTAL_USER } from "@/lib/portal/current-user";

/**
 * GET /api/v1/portal/reports
 *
 * Returns aggregated reports for the current portal user's organization,
 * filtered by their permissions.
 */
export async function GET(_request: NextRequest) {
  const orgId = CURRENT_PORTAL_USER.organizationId;
  const orgName = CURRENT_PORTAL_USER.organizationName;
  const perms = CURRENT_PORTAL_USER.permissions;

  if (!perms.canAccessPortal || !perms.canSeeReports) {
    return NextResponse.json(
      { success: false, error: "Permission denied" },
      { status: 403 }
    );
  }

  const allTickets = await listTickets();
  const orgTickets = allTickets.filter((t) => t.organizationName === orgName);
  const orgProjects = mockProjects.filter((p) => p.organizationId === orgId);
  const orgContracts = mockContracts.filter(
    (c) => c.organizationId === orgId
  );

  const reports: Record<string, unknown> = {
    tickets: {
      total: orgTickets.length,
      open: orgTickets.filter((t) => ["new", "open", "in_progress"].includes(t.status))
        .length,
      resolved: orgTickets.filter((t) => t.status === "resolved").length,
      closed: orgTickets.filter((t) => t.status === "closed").length,
    },
    projects: perms.canSeeProjects
      ? {
          total: orgProjects.length,
          active: orgProjects.filter((p) => p.status === "active").length,
          atRisk: orgProjects.filter((p) => p.isAtRisk).length,
          completed: orgProjects.filter((p) => p.status === "completed").length,
          averageProgress: Math.round(
            orgProjects.reduce((acc, p) => acc + p.progressPercent, 0) /
              Math.max(orgProjects.length, 1)
          ),
        }
      : null,
  };

  if (perms.canSeeTimeReports) {
    const orgEntries = mockTimeEntries.filter(
      (e) => e.organizationId === orgId
    );
    reports.time = {
      totalHours: orgEntries.reduce((acc, e) => acc + e.durationMinutes / 60, 0),
      billableHours: orgEntries
        .filter((e) =>
          ["billable", "hour_bank_overage", "msp_overage"].includes(
            e.coverageStatus
          )
        )
        .reduce((acc, e) => acc + e.durationMinutes / 60, 0),
      includedHours: orgEntries
        .filter((e) =>
          ["included_in_contract", "deducted_from_hour_bank"].includes(
            e.coverageStatus
          )
        )
        .reduce((acc, e) => acc + e.durationMinutes / 60, 0),
    };
  }

  if (perms.canSeeHourBankBalance) {
    const hourBankContracts = orgContracts.filter(
      (c) => c.type === "hour_bank" && c.hourBank
    );
    reports.hourBanks = hourBankContracts.map((c) => ({
      contractId: c.id,
      contractName: c.name,
      totalHours: c.hourBank!.totalHoursPurchased,
      consumedHours: c.hourBank!.hoursConsumed,
      remainingHours: c.hourBank!.totalHoursPurchased - c.hourBank!.hoursConsumed,
      validFrom: c.hourBank!.validFrom,
      validTo: c.hourBank!.validTo,
    }));
  }

  if (perms.canSeeBillingReports) {
    const orgEntries = mockTimeEntries.filter(
      (e) => e.organizationId === orgId
    );
    reports.billing = {
      pendingAmount: orgEntries
        .filter((e) => e.amount && e.approvalStatus !== "invoiced")
        .reduce((acc, e) => acc + (e.amount || 0), 0),
      invoicedAmount: orgEntries
        .filter((e) => e.approvalStatus === "invoiced")
        .reduce((acc, e) => acc + (e.amount || 0), 0),
    };
  }

  return NextResponse.json({
    success: true,
    data: reports,
    meta: {
      organizationId: orgId,
      generatedAt: new Date().toISOString(),
    },
  });
}
