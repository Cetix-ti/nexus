import { NextRequest, NextResponse } from "next/server";
import { mockProjects } from "@/lib/projects/mock-data";
import { CURRENT_PORTAL_USER } from "@/lib/portal/current-user";

/**
 * GET /api/v1/portal/projects
 *
 * Returns ONLY projects visible to the current portal user's organization.
 * Strict filtering: organizationId match + isVisibleToClient + visibilitySettings.showProject
 */
export async function GET(_request: NextRequest) {
  // In a real app, this would come from session/JWT
  const orgId = CURRENT_PORTAL_USER.organizationId;
  const perms = CURRENT_PORTAL_USER.permissions;

  if (!perms.canSeeProjects) {
    return NextResponse.json(
      { success: false, error: "Permission denied" },
      { status: 403 }
    );
  }

  const visibleProjects = mockProjects
    .filter((p) => p.organizationId === orgId)
    .filter((p) => p.isVisibleToClient)
    .filter((p) => p.visibilitySettings.showProject);

  return NextResponse.json({
    success: true,
    data: visibleProjects,
    meta: {
      total: visibleProjects.length,
      organizationId: orgId,
    },
  });
}
