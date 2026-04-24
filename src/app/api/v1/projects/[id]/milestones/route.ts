// ============================================================================
// /api/v1/projects/[id]/milestones — CRUD jalons d'un projet.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const milestones = await prisma.projectMilestone.findMany({
    where: { projectId: id },
    orderBy: { targetDate: "asc" },
  });
  return NextResponse.json({ success: true, data: milestones });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.name) return NextResponse.json({ error: "name requis" }, { status: 400 });
  if (!body?.targetDate) return NextResponse.json({ error: "targetDate requise" }, { status: 400 });

  const milestone = await prisma.projectMilestone.create({
    data: {
      projectId: id,
      name: String(body.name).trim(),
      description: body.description ? String(body.description) : null,
      targetDate: new Date(body.targetDate),
      status: body.status ?? "upcoming",
      isCriticalPath: !!body.isCriticalPath,
    },
  });
  return NextResponse.json({ success: true, data: milestone });
}
