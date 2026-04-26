// ============================================================================
// /api/v1/organizations/[id]/work-types
//
// CRUD bulk des libellés de type de travail pour un client. Chaque libellé
// porte un taux horaire propre — c'est ce taux qui sert de base au moteur
// de facturation au moment d'une saisie de temps (les multiplicateurs
// soir/weekend du client s'appliquent par-dessus).
//
// GET   → liste
// PUT   → remplace l'ensemble (sync — admin only). Body : { workTypes: [...] }
//          - création des nouveaux (id absent ou non trouvé)
//          - update des existants
//          - suppression des disparus
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx {
  params: Promise<{ id: string }>;
}

const VALID_TIME_TYPES = new Set([
  "remote_work",
  "onsite_work",
  "travel",
  "preparation",
  "administration",
  "waiting",
  "follow_up",
  "internal",
  "other",
]);

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN";
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const rows = await prisma.orgWorkType.findMany({
    where: { organizationId: id },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return NextResponse.json({ data: rows });
}

interface IncomingWorkType {
  id?: string;
  label: string;
  timeType: string;
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
  const incoming = Array.isArray(body.workTypes)
    ? (body.workTypes as IncomingWorkType[])
    : null;
  if (!incoming) {
    return NextResponse.json(
      { error: "Body { workTypes: [...] } requis" },
      { status: 400 },
    );
  }
  // Validation de chaque entrée — refuse tout ce qui est mal formé pour
  // éviter de polluer la DB avec des libellés vides ou des timeType
  // inconnus du moteur de facturation.
  for (const w of incoming) {
    if (!w.label || typeof w.label !== "string" || !w.label.trim()) {
      return NextResponse.json({ error: "label vide" }, { status: 400 });
    }
    if (!VALID_TIME_TYPES.has(w.timeType)) {
      return NextResponse.json(
        { error: `timeType invalide: ${w.timeType}` },
        { status: 400 },
      );
    }
  }

  // Dédup label (unique constraint client_id, label)
  const seenLabels = new Set<string>();
  for (const w of incoming) {
    const k = w.label.trim().toLowerCase();
    if (seenLabels.has(k)) {
      return NextResponse.json(
        { error: `Libellé dupliqué : ${w.label}` },
        { status: 400 },
      );
    }
    seenLabels.add(k);
  }

  const existing = await prisma.orgWorkType.findMany({
    where: { organizationId: id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));
  const incomingIds = new Set(
    incoming.map((w) => w.id).filter((x): x is string => !!x),
  );
  const toDelete = [...existingIds].filter((eid) => !incomingIds.has(eid));

  await prisma.$transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.orgWorkType.deleteMany({ where: { id: { in: toDelete } } });
    }
    for (const w of incoming) {
      const data = {
        organizationId: id,
        label: w.label.trim(),
        timeType: w.timeType,
        isActive: w.isActive ?? true,
        sortOrder: w.sortOrder ?? 0,
      };
      if (w.id && existingIds.has(w.id)) {
        await tx.orgWorkType.update({ where: { id: w.id }, data });
      } else {
        await tx.orgWorkType.create({ data });
      }
    }
  });

  const rows = await prisma.orgWorkType.findMany({
    where: { organizationId: id },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return NextResponse.json({ data: rows });
}
