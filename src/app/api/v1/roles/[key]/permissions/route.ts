// ============================================================================
// GET /api/v1/roles/[key]/permissions — liste les permissions accordées.
// PUT /api/v1/roles/[key]/permissions — remplace le set entier.
//   Body : { permissions: string[] }
//   Refuse toute clé inconnue (non listée dans ALL_PERMISSION_KEYS).
//
// SUPER_ADMIN uniquement. Invalide le cache runtime après écriture.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { ALL_PERMISSION_KEYS, SYSTEM_ROLES } from "@/lib/permissions/defs";
import {
  getRolePermissions,
  invalidateRolePermissionsCache,
} from "@/lib/permissions/resolve";

async function requireSuperAdmin() {
  const me = await getCurrentUser();
  if (!me) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (me.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "SUPER_ADMIN uniquement" }, { status: 403 }) };
  }
  return { me };
}

async function resolveRoleExists(key: string): Promise<boolean> {
  if (SYSTEM_ROLES.some((r) => r.key === key)) return true;
  const custom = await prisma.customRole.findUnique({ where: { key }, select: { key: true } });
  return !!custom;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireSuperAdmin();
  if (error) return error;
  const { key } = await params;

  if (!(await resolveRoleExists(key))) {
    return NextResponse.json({ error: "Rôle introuvable" }, { status: 404 });
  }

  // getRolePermissions gère le seed lazy des rôles système.
  const perms = await getRolePermissions(key);
  return NextResponse.json({ roleKey: key, permissions: Array.from(perms).sort() });
}

const putSchema = z.object({
  permissions: z.array(z.string()).max(200),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireSuperAdmin();
  if (error) return error;
  const { key } = await params;

  if (!(await resolveRoleExists(key))) {
    return NextResponse.json({ error: "Rôle introuvable" }, { status: 404 });
  }

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation échouée", issues: parsed.error.issues }, { status: 400 });
  }

  // Vérifie que toutes les clés sont connues — refuse silencieusement
  // toute permission inventée (évite d'accumuler des grants inutiles).
  const unknown = parsed.data.permissions.filter((p) => !ALL_PERMISSION_KEYS.has(p));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Permissions inconnues : ${unknown.join(", ")}` },
      { status: 400 },
    );
  }

  // Dédoublonne côté serveur (l'unique constraint protège déjà la DB).
  const nextSet = Array.from(new Set(parsed.data.permissions));

  // Replace stratégie : deleteMany + createMany en transaction.
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleKey: key } }),
    prisma.rolePermission.createMany({
      data: nextSet.map((permissionKey) => ({ roleKey: key, permissionKey })),
      skipDuplicates: true,
    }),
  ]);

  invalidateRolePermissionsCache(key);

  return NextResponse.json({ roleKey: key, permissions: nextSet.sort() });
}
