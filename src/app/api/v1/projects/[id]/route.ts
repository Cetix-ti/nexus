import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      manager: { select: { id: true, firstName: true, lastName: true } },
      tasks: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description ?? "",
      organizationId: project.organizationId,
      organizationName: project.organization.name,
      type: project.type,
      status: project.status,
      priority: project.priority,
      managerId: project.managerId,
      managerName: `${project.manager.firstName} ${project.manager.lastName}`,
      startDate: project.startDate?.toISOString() ?? "",
      targetEndDate: project.targetEndDate?.toISOString() ?? "",
      actualEndDate: project.actualEndDate?.toISOString() ?? null,
      progressPercent: project.progressPercent,
      budgetHours: project.budgetHours,
      consumedHours: project.consumedHours,
      budgetAmount: project.budgetAmount,
      consumedAmount: project.consumedAmount,
      isVisibleToClient: project.isVisibleToClient,
      tags: project.tags,
      isAtRisk: project.isAtRisk,
      riskNotes: project.riskNotes,
      isArchived: project.isArchived,
      taskCount: project.tasks.length,
      completedTaskCount: project.tasks.filter((t) => t.status === "completed").length,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      tasks: project.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assigneeId,
        startDate: t.startDate?.toISOString() ?? null,
        dueDate: t.dueDate?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        estimatedHours: t.estimatedHours,
        actualHours: t.actualHours,
        progressPercent: t.progressPercent,
        isVisibleToClient: t.isVisibleToClient,
        order: t.sortOrder,
      })),
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) data.status = body.status;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.type !== undefined) data.type = body.type;
  if (body.progressPercent !== undefined) data.progressPercent = body.progressPercent;
  if (body.isVisibleToClient !== undefined) data.isVisibleToClient = body.isVisibleToClient;
  if (body.isAtRisk !== undefined) data.isAtRisk = body.isAtRisk;
  if (body.riskNotes !== undefined) data.riskNotes = body.riskNotes;
  if (body.budgetHours !== undefined) data.budgetHours = body.budgetHours;
  if (body.budgetAmount !== undefined) data.budgetAmount = body.budgetAmount;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.targetEndDate !== undefined) data.targetEndDate = body.targetEndDate ? new Date(body.targetEndDate) : null;
  if (body.tags !== undefined) data.tags = body.tags;
  if (body.managerId !== undefined) data.managerId = body.managerId;

  try {
    const updated = await prisma.project.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  try {
    await prisma.project.update({ where: { id }, data: { isArchived: true } });
    return NextResponse.json({ success: true, data: { id, isArchived: true } });
  } catch {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }
}
