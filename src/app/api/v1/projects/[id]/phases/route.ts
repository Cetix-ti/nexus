// ============================================================================
// /api/v1/projects/[id]/phases — CRUD phases d'un projet.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const phases = await prisma.projectPhase.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ success: true, data: phases });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.name) return NextResponse.json({ error: "name requis" }, { status: 400 });

  // sortOrder = max + 1 pour ajouter en fin de liste.
  const last = await prisma.projectPhase.findFirst({
    where: { projectId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const phase = await prisma.projectPhase.create({
    data: {
      projectId: id,
      name: String(body.name).trim(),
      description: body.description ? String(body.description) : null,
      status: body.status ?? "not_started",
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      estimatedHours:
        body.estimatedHours == null || body.estimatedHours === ""
          ? null
          : Number(body.estimatedHours),
      sortOrder,
    },
  });
  // Recalcule progressPercent du projet (au cas où la nouvelle phase
  // change le total des estimatedHours et donc le ratio).
  const { recomputeProjectProgress } = await import("@/lib/projects/progress");
  await recomputeProjectProgress(id);
  return NextResponse.json({ success: true, data: phase });
}
