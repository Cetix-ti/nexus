import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET(_request: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.canSeeProjects) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isPortalAdmin = user.portalRole === "ADMIN";

  // 1. Projects that belong to this org and are visible to clients
  const ownProjects = await prisma.project.findMany({
    where: {
      organizationId: user.organizationId,
      isVisibleToClient: true,
      isArchived: false,
    },
    include: {
      organization: { select: { name: true } },
      manager: { select: { firstName: true, lastName: true } },
      tasks: { where: { isVisibleToClient: true }, select: { id: true, status: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // 2. Projects shared with this org (SECURITY: only for portal admins)
  let sharedProjects: typeof ownProjects = [];
  if (isPortalAdmin) {
    const shares = await prisma.sharedResource.findMany({
      where: {
        targetOrgId: user.organizationId,
        resourceType: "project",
        projectId: { not: null },
        // Only include admin-only shares if user IS admin (which they are here)
      },
      select: { projectId: true },
    });

    const sharedProjectIds = shares
      .map((s) => s.projectId)
      .filter((id): id is string => id !== null);

    if (sharedProjectIds.length > 0) {
      sharedProjects = await prisma.project.findMany({
        where: {
          id: { in: sharedProjectIds },
          isArchived: false,
          // SECURITY: do NOT filter by organizationId here — these are cross-org shares
          // But we DO verify they were explicitly shared via SharedResource above
        },
        include: {
          organization: { select: { name: true } },
          manager: { select: { firstName: true, lastName: true } },
          tasks: { where: { isVisibleToClient: true }, select: { id: true, status: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
    }
  }

  // Merge and deduplicate (a project might be both owned and shared)
  const seenIds = new Set<string>();
  const allProjects = [...ownProjects, ...sharedProjects].filter((p) => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  const data = allProjects.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description ?? "",
    organizationId: p.organizationId,
    organizationName: p.organization.name,
    type: p.type,
    status: p.status,
    priority: p.priority,
    managerName: `${p.manager.firstName} ${p.manager.lastName}`,
    startDate: p.startDate?.toISOString() ?? "",
    targetEndDate: p.targetEndDate?.toISOString() ?? "",
    progressPercent: p.progressPercent,
    budgetHours: p.budgetHours,
    consumedHours: p.consumedHours,
    isVisibleToClient: true,
    isShared: p.organizationId !== user.organizationId,
    taskCount: p.tasks.length,
    completedTaskCount: p.tasks.filter((t) => t.status === "completed").length,
    isAtRisk: p.isAtRisk,
    tags: p.tags,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return NextResponse.json({
    success: true,
    data,
    meta: { total: data.length, organizationId: user.organizationId },
  });
}
