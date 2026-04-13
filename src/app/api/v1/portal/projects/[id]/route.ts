import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.canSeeProjects) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true } },
      manager: { select: { firstName: true, lastName: true } },
      tasks: {
        where: { isVisibleToClient: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  // SECURITY: Check access rights
  const isOwnOrgProject = project.organizationId === user.organizationId && project.isVisibleToClient;
  const isPortalAdmin = user.portalRole === "ADMIN";

  // Check if this project was explicitly shared with the user's org
  let isSharedProject = false;
  if (!isOwnOrgProject && isPortalAdmin) {
    const share = await prisma.sharedResource.findFirst({
      where: {
        resourceType: "project",
        projectId: project.id,
        targetOrgId: user.organizationId,
      },
    });
    isSharedProject = !!share;
  }

  if (!isOwnOrgProject && !isSharedProject) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  const perms = user.permissions;

  return NextResponse.json({
    success: true,
    data: {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description ?? "",
      status: project.status,
      priority: project.priority,
      type: project.type,
      managerName: `${project.manager.firstName} ${project.manager.lastName}`,
      organizationName: project.organization.name,
      startDate: project.startDate?.toISOString() ?? "",
      targetEndDate: project.targetEndDate?.toISOString() ?? "",
      progressPercent: project.progressPercent,
      consumedHours: project.consumedHours,
      budgetHours: project.budgetHours,
      isAtRisk: project.isAtRisk,
      tags: project.tags,
      tasks: perms.canSeeProjectTasks ? project.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate?.toISOString() ?? null,
        progressPercent: t.progressPercent,
      })) : [],
      taskCount: project.tasks.length,
      completedTaskCount: project.tasks.filter((t) => t.status === "completed").length,
    },
  });
}
