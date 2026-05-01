// ============================================================================
// /api/v1/projects/[id]/members/[memberId] — édition d'un membre projet.
// La création/suppression reste sur /members (POST + DELETE par ?memberId=).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx {
  params: Promise<{ id: string; memberId: string }>;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, memberId } = await ctx.params;

  // Confirme que le membre appartient bien à ce projet — empêche un
  // PATCH cross-projet par mauvais id.
  const member = await prisma.projectMember.findFirst({
    where: { id: memberId, projectId: id },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.role === "string") data.role = body.role;
  if (body.allocatedHoursPerWeek !== undefined) {
    data.allocatedHoursPerWeek =
      body.allocatedHoursPerWeek === null
        ? null
        : Number(body.allocatedHoursPerWeek);
  }

  const updated = await prisma.projectMember.update({
    where: { id: memberId },
    data,
    include: {
      user: { select: { firstName: true, lastName: true, email: true, avatar: true } },
    },
  });
  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      userId: updated.userId,
      agentName: `${updated.user.firstName} ${updated.user.lastName}`.trim(),
      agentEmail: updated.user.email,
      agentAvatar: updated.user.avatar ?? null,
      role: updated.role,
      allocatedHoursPerWeek: updated.allocatedHoursPerWeek,
    },
  });
}
