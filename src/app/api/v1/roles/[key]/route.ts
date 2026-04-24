// ============================================================================
// DELETE /api/v1/roles/[key] — supprime un rôle CUSTOM (interdit sur
// rôle système). Supprime aussi les RolePermission attachées (cascade
// manuel — pas de FK car roleKey peut être enum ou custom).
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { SYSTEM_ROLES } from "@/lib/permissions/defs";
import { invalidateRolePermissionsCache } from "@/lib/permissions/resolve";

async function requireSuperAdmin() {
  const me = await getCurrentUser();
  if (!me) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (me.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "SUPER_ADMIN uniquement" }, { status: 403 }) };
  }
  return { me };
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { key } = await params;

  if (SYSTEM_ROLES.some((r) => r.key === key)) {
    return NextResponse.json(
      { error: "Impossible de supprimer un rôle système" },
      { status: 400 },
    );
  }

  const existing = await prisma.customRole.findUnique({ where: { key } });
  if (!existing) {
    return NextResponse.json({ error: "Rôle introuvable" }, { status: 404 });
  }

  // Refuse si des utilisateurs sont encore assignés à ce rôle custom.
  const assigned = await prisma.user.count({ where: { customRoleKey: key } });
  if (assigned > 0) {
    return NextResponse.json(
      { error: `Impossible de supprimer : ${assigned} utilisateur${assigned > 1 ? "s" : ""} encore assigné${assigned > 1 ? "s" : ""} à ce rôle. Réassigne-les d'abord.` },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleKey: key } }),
    prisma.customRole.delete({ where: { key } }),
  ]);

  invalidateRolePermissionsCache(key);
  return NextResponse.json({ ok: true });
}
