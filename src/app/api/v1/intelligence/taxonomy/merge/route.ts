// ============================================================================
// POST /api/v1/intelligence/taxonomy/merge
//
// Fusionne une catégorie SOURCE dans une catégorie TARGET : déplace les
// tickets (categoryId) et archive la source (isActive=false). Admin ack
// de la suggestion via pairId.
//
// Body : { pairId, sourceCategoryId, targetCategoryId }
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    pairId?: string;
    sourceCategoryId?: string;
    targetCategoryId?: string;
  };
  if (!body.pairId || !body.sourceCategoryId || !body.targetCategoryId) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (body.sourceCategoryId === body.targetCategoryId) {
    return NextResponse.json(
      { error: "Source and target must differ" },
      { status: 400 },
    );
  }

  // Vérifie que les deux catégories existent.
  const [source, target] = await Promise.all([
    prisma.category.findUnique({
      where: { id: body.sourceCategoryId },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.category.findUnique({
      where: { id: body.targetCategoryId },
      select: { id: true, name: true, isActive: true },
    }),
  ]);
  if (!source || !target) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // Transaction : reassign les tickets + children + archive source.
  await prisma.$transaction([
    prisma.ticket.updateMany({
      where: { categoryId: body.sourceCategoryId },
      data: { categoryId: body.targetCategoryId },
    }),
    // Orphelins des enfants : reparent vers le target (les enfants directs
    // de la source deviennent enfants du target — préserve la hiérarchie).
    prisma.category.updateMany({
      where: { parentId: body.sourceCategoryId },
      data: { parentId: body.targetCategoryId },
    }),
    prisma.category.update({
      where: { id: body.sourceCategoryId },
      data: { isActive: false },
    }),
  ]);

  // Supprime la suggestion — elle a été traitée.
  await prisma.aiPattern.deleteMany({
    where: {
      scope: "taxonomy:dedup",
      kind: "pair",
      key: body.pairId,
    },
  });

  // Invalide aussi le centroid de la source — il n'a plus de raison d'être.
  await prisma.aiPattern.deleteMany({
    where: {
      scope: `centroid:${body.sourceCategoryId}`,
      kind: "centroid",
    },
  });

  return NextResponse.json({
    ok: true,
    sourceArchivedId: source.id,
    targetCategoryId: target.id,
  });
}
