import { NextRequest, NextResponse } from "next/server";
import {
  mockProjects,
  mockProjectPhases,
  mockProjectMilestones,
  mockProjectTasks,
  mockProjectMembers,
  mockProjectActivities,
} from "@/lib/projects/mock-data";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/projects/[id]
 * Returns full project with phases, milestones, tasks, members, activities
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const project = mockProjects.find((p) => p.id === id);
  if (!project) {
    return NextResponse.json(
      { success: false, error: "Project not found" },
      { status: 404 }
    );
  }

  const phases = mockProjectPhases.filter((p) => p.projectId === id);
  const milestones = mockProjectMilestones.filter((m) => m.projectId === id);
  const tasks = mockProjectTasks.filter((t) => t.projectId === id);
  const members = mockProjectMembers.filter((m) => m.projectId === id);
  const activities = mockProjectActivities.filter((a) => a.projectId === id);

  return NextResponse.json({
    success: true,
    data: {
      ...project,
      phases,
      milestones,
      tasks,
      members,
      activities,
    },
  });
}

/**
 * PATCH /api/v1/projects/[id]
 * Update project (mock — echoes back)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();

  const project = mockProjects.find((p) => p.id === id);
  if (!project) {
    return NextResponse.json(
      { success: false, error: "Project not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      ...project,
      ...body,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * DELETE /api/v1/projects/[id]
 * Soft delete (mock — echoes back archive flag)
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const project = mockProjects.find((p) => p.id === id);
  if (!project) {
    return NextResponse.json(
      { success: false, error: "Project not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { id, isArchived: true },
  });
}
