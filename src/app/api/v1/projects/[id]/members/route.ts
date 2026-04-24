// ============================================================================
// /api/v1/projects/[id]/members — équipe d'un projet (CRUD).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const members = await prisma.projectMember.findMany({
    where: { projectId: id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    success: true,
    data: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      agentName: `${m.user.firstName} ${m.user.lastName}`.trim(),
      agentEmail: m.user.email,
      role: m.role,
      allocatedHoursPerWeek: m.allocatedHoursPerWeek,
    })),
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.userId) return NextResponse.json({ error: "userId requis" }, { status: 400 });

  try {
    const member = await prisma.projectMember.create({
      data: {
        projectId: id,
        userId: String(body.userId),
        role: body.role ?? "contributor",
        allocatedHoursPerWeek:
          body.allocatedHoursPerWeek != null ? Number(body.allocatedHoursPerWeek) : null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return NextResponse.json({
      success: true,
      data: {
        id: member.id,
        userId: member.userId,
        agentName: `${member.user.firstName} ${member.user.lastName}`.trim(),
        agentEmail: member.user.email,
        role: member.role,
        allocatedHoursPerWeek: member.allocatedHoursPerWeek,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "Ce membre fait déjà partie du projet." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId requis" }, { status: 400 });
  await prisma.projectMember.deleteMany({
    where: { id: memberId, projectId: id },
  });
  return NextResponse.json({ success: true });
}
