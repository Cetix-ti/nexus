// ============================================================================
// /api/v1/organizations/[id]/rate-tiers
//
// CRUD bulk des paliers tarifaires d'un client. Chaque palier porte un
// libellé + un taux horaire. L'agent en choisit un à la saisie de temps :
// son `hourlyRate` devient la base utilisée par le moteur de facturation
// (les multiplicateurs soir/weekend du client s'appliquent par-dessus).
//
// GET → liste
// PUT → remplace l'ensemble (sync — admin only). Body : { rateTiers: [...] }
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

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
  const rows = await prisma.orgRateTier.findMany({
    where: { organizationId: id },
    orderBy: [{ sortOrder: "asc" }, { hourlyRate: "asc" }],
  });
  return NextResponse.json({ data: rows });
}

interface IncomingRateTier {
  id?: string;
  label: string;
  hourlyRate: number;
  /** Niveau associé (1, 2, 3...) — drive l'auto-sélection du palier
   *  selon le User.level de l'agent. Null/absent = palier ouvert à tous. */
  linkedLevel?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const incoming = Array.isArray(body.rateTiers)
    ? (body.rateTiers as IncomingRateTier[])
    : null;
  if (!incoming) {
    return NextResponse.json(
      { error: "Body { rateTiers: [...] } requis" },
      { status: 400 },
    );
  }
  for (const t of incoming) {
    if (!t.label || typeof t.label !== "string" || !t.label.trim()) {
      return NextResponse.json({ error: "label vide" }, { status: 400 });
    }
    if (!Number.isFinite(t.hourlyRate) || t.hourlyRate < 0) {
      return NextResponse.json({ error: "hourlyRate invalide" }, { status: 400 });
    }
  }
  // Dédup label
  const seen = new Set<string>();
  for (const t of incoming) {
    const k = t.label.trim().toLowerCase();
    if (seen.has(k)) {
      return NextResponse.json(
        { error: `Libellé dupliqué : ${t.label}` },
        { status: 400 },
      );
    }
    seen.add(k);
  }

  const existing = await prisma.orgRateTier.findMany({
    where: { organizationId: id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));
  const incomingIds = new Set(
    incoming.map((t) => t.id).filter((x): x is string => !!x),
  );
  const toDelete = [...existingIds].filter((eid) => !incomingIds.has(eid));

  await prisma.$transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.orgRateTier.deleteMany({ where: { id: { in: toDelete } } });
    }
    for (const t of incoming) {
      const data = {
        organizationId: id,
        label: t.label.trim(),
        hourlyRate: t.hourlyRate,
        linkedLevel: t.linkedLevel ?? null,
        isActive: t.isActive ?? true,
        sortOrder: t.sortOrder ?? 0,
      };
      if (t.id && existingIds.has(t.id)) {
        await tx.orgRateTier.update({ where: { id: t.id }, data });
      } else {
        await tx.orgRateTier.create({ data });
      }
    }
  });

  const rows = await prisma.orgRateTier.findMany({
    where: { organizationId: id },
    orderBy: [{ sortOrder: "asc" }, { hourlyRate: "asc" }],
  });
  return NextResponse.json({ data: rows });
}
