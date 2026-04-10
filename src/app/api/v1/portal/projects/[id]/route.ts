import { NextRequest, NextResponse } from "next/server";
import {
  mockProjects,
  mockProjectPhases,
  mockProjectMilestones,
  mockProjectTasks,
  mockProjectMembers,
  mockProjectActivities,
} from "@/lib/projects/mock-data";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const orgId = user.organizationId;
  const perms = user.permissions;

  if (!perms.canSeeProjects) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = mockProjects.find((p) => p.id === id);

  // Strict org check + visibility check
  if (
    !project ||
    project.organizationId !== orgId ||
    !project.isVisibleToClient ||
    !project.visibilitySettings.showProject
  ) {
    return NextResponse.json(
      { success: false, error: "Project not found or not accessible" },
      { status: 404 }
    );
  }

  if (!perms.canSeeProjectDetails) {
    // Return basic info only
    return NextResponse.json({
      success: true,
      data: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        progressPercent: project.progressPercent,
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
      },
    });
  }

  const vs = project.visibilitySettings;

  const data = {
    ...project,
    phases: vs.showPhases
      ? mockProjectPhases
          .filter((p) => p.projectId === id)
          .filter((p) => p.isVisibleToClient)
      : [],
    milestones: vs.showMilestones
      ? mockProjectMilestones
          .filter((m) => m.projectId === id)
          .filter((m) => m.isVisibleToClient)
      : [],
    tasks:
      vs.showTasks && perms.canSeeProjectTasks
        ? mockProjectTasks
            .filter((t) => t.projectId === id)
            .filter((t) => t.isVisibleToClient)
        : [],
    members: vs.showTeamMembers
      ? mockProjectMembers.filter((m) => m.projectId === id)
      : [],
    activities: vs.showActivity
      ? mockProjectActivities
          .filter((a) => a.projectId === id)
          .filter((a) => a.isVisibleToClient)
      : [],
    // Hide budget if not allowed
    budgetAmount: vs.showBudgetVsActual ? project.budgetAmount : undefined,
    consumedAmount: vs.showBudgetVsActual ? project.consumedAmount : undefined,
    consumedHours: vs.showTimeConsumed ? project.consumedHours : undefined,
    budgetHours: vs.showBudgetVsActual ? project.budgetHours : undefined,
  };

  return NextResponse.json({ success: true, data });
}
