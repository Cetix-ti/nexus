// ============================================================================
// PATCH / DELETE /api/v1/categories/[id]
//
// Nécessaire pour que les suggestions "rename" et "rehome" de l'Audit IA
// (/settings/categories) puissent être appliquées en un clic. Également
// utile pour l'UI d'édition manuelle.
//
// Règles métier :
// - rehome (parentId change) : on refuse de créer un cycle (category
//   devenant son propre ancêtre).
// - delete : soft-delete (isActive=false) car les Tickets référencent la
//   categoryId et cascade delete briserait l'historique. L'Audit IA peut
//   proposer "rehome"/"rename", pas "delete" — mais l'endpoint est utile
//   pour l'UI manuelle.
// ============================================================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

async function wouldCreateCycle(catId: string, newParentId: string): Promise<boolean> {
  // Parcourt la chaîne parent du nouveau parent : si on tombe sur catId,
  // c'est un cycle.
  let cursor: string | null = newParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === catId) return true;
    if (seen.has(cursor)) return true; // cycle déjà existant — on refuse aussi
    seen.add(cursor);
    const p: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = p?.parentId ?? null;
  }
  return false;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Prisma.CategoryUpdateInput = {};
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
    }
    data.name = trimmed;
  }
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.icon === "string") data.icon = body.icon;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  // Rehome : changement du parentId (peut être null → racine).
  if ("parentId" in body) {
    const newParentId: string | null = body.parentId ?? null;
    if (newParentId && newParentId === id) {
      return NextResponse.json(
        { error: "Une catégorie ne peut pas être son propre parent" },
        { status: 400 },
      );
    }
    if (newParentId) {
      const cycle = await wouldCreateCycle(id, newParentId);
      if (cycle) {
        return NextResponse.json(
          { error: "Ce changement créerait un cycle dans l'arborescence" },
          { status: 400 },
        );
      }
      data.parent = { connect: { id: newParentId } };
    } else {
      data.parent = { disconnect: true };
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  try {
    const updated = await prisma.category.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Catégorie introuvable" }, { status: 404 });
    }
    console.error("[categories PATCH] erreur :", e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Soft-delete : on marque isActive=false. Les tickets existants gardent
  // leur FK et continuent d'afficher le nom via la relation. La catégorie
  // disparaît juste des sélecteurs (qui filtrent where isActive=true).
  try {
    // Soft-delete aussi les enfants pour ne pas laisser d'orphelins actifs
    // pointant vers un parent désactivé.
    const descendants = await prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id FROM categories WHERE id = ${id}
        UNION ALL
        SELECT c.id FROM categories c
        INNER JOIN tree t ON c.parent_id = t.id
      )
      SELECT id FROM tree
    `;
    const ids = descendants.map((d) => d.id);
    await prisma.category.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true, deactivated: ids.length });
  } catch (e) {
    console.error("[categories DELETE] erreur :", e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
