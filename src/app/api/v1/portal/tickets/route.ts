import { NextRequest, NextResponse } from "next/server";
import { listTickets } from "@/lib/tickets/service";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET(request: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.permissions.canAccessPortal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;

  // Query DB with organization filter — no client-side filtering needed
  let result = await listTickets({
    organizationId: user.organizationId,
    status: sp.get("status") || undefined,
    search: sp.get("search") || undefined,
  });

  // Standard users only see their own tickets
  if (!user.permissions.canSeeAllOrgTickets) {
    result = result.filter((t) => t.requesterEmail === user.email);
  }

  return NextResponse.json({
    success: true,
    data: result,
    meta: {
      total: result.length,
      organizationId: user.organizationId,
      scope: user.permissions.canSeeAllOrgTickets ? "all_org" : "own_only",
    },
  });
}
