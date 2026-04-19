// ============================================================================
// GET / PATCH /api/v1/organizations/[id]/ai-consent
//
// Gestion du consent IA par organisation (Loi 25). Lisible/modifiable par
// SUPERVISOR+ (staff MSP) OU CLIENT_ADMIN de l'org elle-même.
//
// GET    : retourne le consent actif (ou défauts si absent — tout à true).
// PATCH  : met à jour. Crée la row si absente.
//
// Un flip à aiEnabled=false bloque immédiatement toutes les features IA pour
// cette org (cache invalidé). Pour révoquer ET anonymiser les données
// passées, utiliser /api/v1/ai/data-delete.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { invalidateConsentCache } from "@/lib/ai/consent";

async function authorize(
  req: { id: string },
): Promise<{ ok: true; userId: string; email: string | null } | { ok: false; res: Response }> {
  const me = await getCurrentUser();
  if (!me) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const isStaff = hasMinimumRole(me.role, "SUPERVISOR");
  if (!isStaff) {
    const membership = await prisma.userOrganization.findFirst({
      where: {
        userId: me.id,
        organizationId: req.id,
        role: { in: ["CLIENT_ADMIN"] },
      },
      select: { id: true },
    });
    if (!membership) {
      return {
        ok: false,
        res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
  }
  return { ok: true, userId: me.id, email: me.email ?? null };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize({ id });
  if (!auth.ok) return auth.res;

  const row = await prisma.aiConsent.findUnique({
    where: { organizationId: id },
  });
  if (!row) {
    return NextResponse.json({
      organizationId: id,
      aiEnabled: true,
      cloudProvidersAllowed: true,
      learningEnabled: true,
      clientContentEnabled: true,
      isExplicit: false,
      note: "Aucun consent explicite — défauts appliqués (tout autorisé).",
    });
  }
  return NextResponse.json({ ...row, isExplicit: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize({ id });
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.aiEnabled === "boolean") patch.aiEnabled = body.aiEnabled;
  if (typeof body.cloudProvidersAllowed === "boolean")
    patch.cloudProvidersAllowed = body.cloudProvidersAllowed;
  if (typeof body.learningEnabled === "boolean")
    patch.learningEnabled = body.learningEnabled;
  if (typeof body.clientContentEnabled === "boolean")
    patch.clientContentEnabled = body.clientContentEnabled;
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 1000);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Aucun champ valide fourni" },
      { status: 400 },
    );
  }
  patch.updatedBy = auth.userId;

  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json(
      { error: "Organisation introuvable" },
      { status: 404 },
    );
  }

  const updated = await prisma.aiConsent.upsert({
    where: { organizationId: id },
    create: {
      organizationId: id,
      aiEnabled: (patch.aiEnabled as boolean | undefined) ?? true,
      cloudProvidersAllowed:
        (patch.cloudProvidersAllowed as boolean | undefined) ?? true,
      learningEnabled: (patch.learningEnabled as boolean | undefined) ?? true,
      clientContentEnabled:
        (patch.clientContentEnabled as boolean | undefined) ?? true,
      updatedBy: auth.userId,
      notes: (patch.notes as string | undefined) ?? null,
    },
    update: patch,
  });

  // Invalide le cache pour que le flip soit immédiat côté orchestrateur.
  invalidateConsentCache(id);

  // Trace dans AuditLog (qui a modifié, quel flag).
  try {
    await prisma.auditLog.create({
      data: {
        action: "ai.consent_update",
        entityType: "Organization",
        entityId: id,
        userId: auth.userId,
        userEmail: auth.email,
        organizationId: id,
        metadata: patch as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch {
    /* non bloquant */
  }

  return NextResponse.json({ ...updated, isExplicit: true });
}
