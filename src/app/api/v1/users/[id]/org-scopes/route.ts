// ============================================================================
// /api/v1/users/[id]/org-scopes
//
// Gestion des organisations accessibles à un utilisateur (Phase 9 — scoping
// technicien). Aucune scope = accès complet (default). 1+ scopes = restreint
// uniquement à ces orgs.
//
// GET : liste des org-scopes de l'utilisateur.
// PUT : remplace l'ensemble (sync bulk). Body : { organizationIds: string[] }.
//       Liste vide = retire toutes les restrictions (= accès complet).
//
// Permissions : SUPER_ADMIN ou MSP_ADMIN (pas de self-edit — un user ne
// peut pas changer son propre périmètre).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

interface Ctx {
  params: Promise<{ id: string }>;
}

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN";
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  // Un user peut lire ses propres scopes, un admin peut lire ceux de
  // n'importe qui.
  if (id !== me.id && !canEdit(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await prisma.userOrganizationScope.findMany({
    where: { userId: id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { organization: { name: "asc" } },
  });
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organization.name,
      organizationSlug: r.organization.slug,
      permission: r.permission,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

const putSchema = z.object({
  organizationIds: z.array(z.string()).max(500),
  permission: z.enum(["READ", "WRITE"]).optional(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  // Garde-fou : pas de self-restriction (sinon un MSP_ADMIN qui se mute
  // sur 0 org perdrait son accès). SUPER_ADMIN peut tout faire.
  if (id === me.id && me.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Vous ne pouvez pas modifier votre propre périmètre d'accès." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { organizationIds, permission } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // Pas de scope sur SUPER_ADMIN (bypass de toute façon, mais on évite
  // la confusion d'avoir des rows qui n'ont aucun effet).
  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Un super-admin a accès complet par définition — pas de scope possible." },
      { status: 400 },
    );
  }

  // Valide que toutes les orgs existent (sinon ID fantaisiste = scope
  // qui ne servira jamais).
  if (organizationIds.length > 0) {
    const found = await prisma.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { id: true },
    });
    if (found.length !== new Set(organizationIds).size) {
      return NextResponse.json(
        { error: "Certaines organisations sont introuvables." },
        { status: 400 },
      );
    }
  }

  // Sync : delete-all puis recreate. Plus simple que diff, et le volume
  // attendu est faible (< 50 orgs par tech).
  await prisma.$transaction(async (tx) => {
    await tx.userOrganizationScope.deleteMany({ where: { userId: id } });
    if (organizationIds.length > 0) {
      await tx.userOrganizationScope.createMany({
        data: organizationIds.map((organizationId) => ({
          userId: id,
          organizationId,
          permission: permission ?? "WRITE",
          grantedById: me.id,
        })),
      });
    }
  });

  const rows = await prisma.userOrganizationScope.findMany({
    where: { userId: id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { organization: { name: "asc" } },
  });
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organization.name,
      organizationSlug: r.organization.slug,
      permission: r.permission,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
