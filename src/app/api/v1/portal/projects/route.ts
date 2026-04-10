import { NextRequest, NextResponse } from "next/server";
import { mockProjects } from "@/lib/projects/mock-data";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET(_request: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.permissions.canSeeProjects) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const visibleProjects = mockProjects
    .filter((p) => p.organizationId === user.organizationId)
    .filter((p) => p.isVisibleToClient)
    .filter((p) => p.visibilitySettings.showProject);

  return NextResponse.json({
    success: true,
    data: visibleProjects,
    meta: {
      total: visibleProjects.length,
      organizationId: user.organizationId,
    },
  });
}
