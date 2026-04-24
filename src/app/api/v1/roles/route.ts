// ============================================================================
// GET  /api/v1/roles — liste les rôles SYSTÈME (enum UserRole) et CUSTOM
//                      (table CustomRole) avec leurs user counts et
//                      permission counts.
// POST /api/v1/roles — crée un rôle custom : { key, label, description?, color?, parentRole? }
//
// Réservé SUPER_ADMIN. La hiérarchie via hasMinimumRole n'est PAS modifiable
// (elle est câblée dans l'enum Prisma + ROLES_HIERARCHY), mais la matrice
// de permissions par rôle est éditable via /api/v1/roles/[key]/permissions.
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { SYSTEM_ROLES } from "@/lib/permissions/defs";

async function requireSuperAdmin() {
  const me = await getCurrentUser();
  if (!me) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (me.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "SUPER_ADMIN uniquement" }, { status: 403 }) };
  }
  return { me };
}

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const [customRoles, userCountsByRole, userCountsByCustomRole, permCounts] = await Promise.all([
    prisma.customRole.findMany({ orderBy: { label: "asc" } }),
    prisma.user.groupBy({ by: ["role"], _count: true, where: { customRoleKey: null } }),
    prisma.user.groupBy({
      by: ["customRoleKey"],
      _count: true,
      where: { customRoleKey: { not: null } },
    }),
    prisma.rolePermission.groupBy({ by: ["roleKey"], _count: true }),
  ]);

  // systemCount = users sans customRoleKey comptés par leur `role`
  const userCountMap = new Map(userCountsByRole.map((r) => [r.role as string, r._count]));
  // customCount = users AVEC customRoleKey, comptés par cette clé
  const customCountMap = new Map<string, number>();
  for (const r of userCountsByCustomRole) {
    if (r.customRoleKey) customCountMap.set(r.customRoleKey, r._count);
  }
  const permCountMap = new Map(permCounts.map((r) => [r.roleKey, r._count]));

  const systemOut = SYSTEM_ROLES.map((r) => ({
    key: r.key,
    label: r.label,
    description: r.description,
    color: r.color,
    isSystem: true,
    parentRole: null,
    userCount: userCountMap.get(r.key) ?? 0,
    permissionCount: permCountMap.get(r.key) ?? 0,
  }));

  const customOut = customRoles.map((r) => ({
    key: r.key,
    label: r.label,
    description: r.description ?? "",
    color: r.color ?? "#64748B",
    isSystem: false,
    parentRole: r.parentRole,
    userCount: customCountMap.get(r.key) ?? 0,
    permissionCount: permCountMap.get(r.key) ?? 0,
  }));

  return NextResponse.json({ roles: [...systemOut, ...customOut] });
}

const createSchema = z.object({
  key: z.string().min(2).max(50).regex(/^[a-z][a-z0-9_]*$/, {
    message: "La clé doit être en minuscules, commencer par une lettre, et ne contenir que [a-z0-9_]",
  }),
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur hex requise (#RRGGBB)").optional(),
  parentRole: z.enum([
    "SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR", "TECHNICIAN", "CLIENT_ADMIN", "CLIENT_USER", "READ_ONLY",
  ]).optional(),
});

export async function POST(req: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation échouée", issues: parsed.error.issues }, { status: 400 });
  }

  // Conflit : la clé est-elle déjà prise par un rôle système ou un custom existant ?
  const upperKey = parsed.data.key.toUpperCase();
  if (SYSTEM_ROLES.some((r) => r.key === upperKey)) {
    return NextResponse.json(
      { error: `La clé « ${parsed.data.key} » entre en conflit avec un rôle système` },
      { status: 409 },
    );
  }
  const existing = await prisma.customRole.findUnique({ where: { key: parsed.data.key } });
  if (existing) {
    return NextResponse.json({ error: "Un rôle custom avec cette clé existe déjà" }, { status: 409 });
  }

  const created = await prisma.customRole.create({
    data: {
      key: parsed.data.key,
      label: parsed.data.label,
      description: parsed.data.description,
      color: parsed.data.color ?? "#64748B",
      parentRole: parsed.data.parentRole,
    },
  });

  return NextResponse.json({
    key: created.key,
    label: created.label,
    description: created.description ?? "",
    color: created.color ?? "#64748B",
    isSystem: false,
    parentRole: created.parentRole,
    userCount: 0,
    permissionCount: 0,
  }, { status: 201 });
}
