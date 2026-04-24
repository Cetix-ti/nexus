// ============================================================================
// /api/v1/projects/[id]/tasks — création de tâche depuis la page projet.
// Complément du PATCH/GET existant sur /api/v1/projects/[id] qui renvoie
// déjà les tâches imbriquées.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.name) return NextResponse.json({ error: "name requis" }, { status: 400 });

  const last = await prisma.projectTask.findFirst({
    where: { projectId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const task = await prisma.projectTask.create({
    data: {
      projectId: id,
      name: String(body.name).trim(),
      description: body.description ? String(body.description) : null,
      status: body.status ?? "todo",
      priority: body.priority ?? "medium",
      assigneeId: body.assigneeId ?? null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      estimatedHours: body.estimatedHours != null ? Number(body.estimatedHours) : null,
      isVisibleToClient: !!body.isVisibleToClient,
      sortOrder,
    },
  });
  return NextResponse.json({ success: true, data: task });
}
