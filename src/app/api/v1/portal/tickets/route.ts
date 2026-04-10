import { NextRequest, NextResponse } from "next/server";
import { listTickets } from "@/lib/tickets/service";
import { CURRENT_PORTAL_USER } from "@/lib/portal/current-user";

/**
 * GET /api/v1/portal/tickets
 *
 * Returns tickets visible to the current portal user.
 * - If canSeeAllOrganizationTickets: returns all org tickets
 * - Otherwise: returns only tickets where the contact is the requester
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const orgName = CURRENT_PORTAL_USER.organizationName;
  const perms = CURRENT_PORTAL_USER.permissions;

  if (!perms.canAccessPortal) {
    return NextResponse.json(
      { success: false, error: "Permission denied" },
      { status: 403 }
    );
  }

  let result = await listTickets({
    status: sp.get("status") || undefined,
    search: sp.get("search") || undefined,
  });

  // Strict org filter (by name — until we wire CURRENT_PORTAL_USER.organizationId to a DB id)
  result = result.filter((t) => t.organizationName === orgName);

  if (!perms.canSeeAllOrganizationTickets) {
    result = result.filter((t) => t.requesterEmail === CURRENT_PORTAL_USER.email);
  }

  return NextResponse.json({
    success: true,
    data: result,
    meta: {
      total: result.length,
      organizationId: CURRENT_PORTAL_USER.organizationId,
      scope: perms.canSeeAllOrganizationTickets ? "all_org" : "own_only",
    },
  });
}
