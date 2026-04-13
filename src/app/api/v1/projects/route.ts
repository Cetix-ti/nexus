import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;

  const where: Record<string, unknown> = { isArchived: false };

  const organizationId = sp.get("organizationId");
  if (organizationId) where.organizationId = organizationId;

  const status = sp.get("status");
  if (status) where.status = { in: status.split(",") };

  const managerId = sp.get("managerId");
  if (managerId) where.managerId = managerId;

  const search = sp.get("search");
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }

  const visibleToClient = sp.get("visibleToClient");
  if (visibleToClient === "true") where.isVisibleToClient = true;

  const projects = await prisma.project.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true } },
      manager: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      tasks: { select: { id: true, status: true } },
      tickets: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const data = projects.map((p) => {
    // Collect unique member IDs from tasks + manager
    const memberIds = new Set<string>();
    memberIds.add(p.managerId);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description ?? "",
      organizationId: p.organizationId,
      organizationName: p.organization.name,
      type: p.type,
      status: p.status,
      priority: p.priority,
      managerId: p.managerId,
      managerName: `${p.manager.firstName} ${p.manager.lastName}`,
      managerAvatar: p.manager.avatar,
      startDate: p.startDate?.toISOString() ?? "",
      targetEndDate: p.targetEndDate?.toISOString() ?? "",
      actualEndDate: p.actualEndDate?.toISOString() ?? null,
      progressPercent: p.progressPercent,
      budgetHours: p.budgetHours,
      consumedHours: p.consumedHours,
      budgetAmount: p.budgetAmount,
      consumedAmount: p.consumedAmount,
      isVisibleToClient: p.isVisibleToClient,
      tags: p.tags,
      isAtRisk: p.isAtRisk,
      riskNotes: p.riskNotes,
      isArchived: p.isArchived,
      taskCount: p.tasks.length,
      completedTaskCount: p.tasks.filter((t) => t.status === "completed").length,
      linkedTicketCount: p.tickets.length,
      memberCount: memberIds.size,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  });

  return NextResponse.json({ success: true, data, meta: { total: data.length } });
}

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.name || !body.organizationId) {
    return NextResponse.json({ error: "Nom et organisation requis" }, { status: 400 });
  }

  // Auto-generate code
  const count = await prisma.project.count();
  const code = body.code || `PRJ-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

  const project = await prisma.project.create({
    data: {
      code,
      name: body.name,
      description: body.description,
      organizationId: body.organizationId,
      type: body.type || "implementation",
      status: body.status || "draft",
      priority: body.priority || "medium",
      managerId: body.managerId || me.id,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      targetEndDate: body.targetEndDate ? new Date(body.targetEndDate) : undefined,
      budgetHours: body.budgetHours,
      budgetAmount: body.budgetAmount,
      isVisibleToClient: body.isVisibleToClient ?? false,
      tags: body.tags ?? [],
    },
    include: {
      organization: { select: { name: true } },
      manager: { select: { firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      ...project,
      organizationName: project.organization.name,
      managerName: `${project.manager.firstName} ${project.manager.lastName}`,
    },
  }, { status: 201 });
}
