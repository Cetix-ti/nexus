// ============================================================================
// /api/v1/projects/[id]/phases/[phaseId] — édition + suppression d'une phase.
// Complète la création/listing exposés par /phases.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx {
  params: Promise<{ id: string; phaseId: string }>;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, phaseId } = await ctx.params;

  // Vérifie que la phase appartient bien au projet — évite qu'un PATCH
  // avec un mauvais id passe sur la phase d'un autre projet.
  const phase = await prisma.projectPhase.findFirst({
    where: { id: phaseId, projectId: id },
    select: { id: true },
  });
  if (!phase) {
    return NextResponse.json({ error: "Phase introuvable" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.description === "string" || body.description === null) {
    data.description = body.description ? String(body.description) : null;
  }
  if (typeof body.status === "string") data.status = body.status;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  if (body.estimatedHours !== undefined) {
    data.estimatedHours =
      body.estimatedHours == null || body.estimatedHours === ""
        ? null
        : Number(body.estimatedHours);
  }

  const updated = await prisma.projectPhase.update({ where: { id: phaseId }, data });
  // Si le statut OU les estimatedHours changent, recalcule le %
  // d'avancement du projet. Skip pour les simples drag-reorder
  // (sortOrder seul) — ça ne change pas l'avancement.
  if (
    typeof body.status === "string" ||
    body.estimatedHours !== undefined
  ) {
    const { recomputeProjectProgress } = await import("@/lib/projects/progress");
    await recomputeProjectProgress(id);
  }
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, phaseId } = await ctx.params;
  const deleted = await prisma.projectPhase.deleteMany({
    where: { id: phaseId, projectId: id },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Phase introuvable" }, { status: 404 });
  }
  // Recalcule après suppression — la phase supprimée n'est plus
  // dans le total, le ratio change.
  const { recomputeProjectProgress } = await import("@/lib/projects/progress");
  await recomputeProjectProgress(id);
  return NextResponse.json({ success: true });
}
