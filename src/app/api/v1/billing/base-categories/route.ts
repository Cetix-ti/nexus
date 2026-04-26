// ============================================================================
// /api/v1/billing/base-categories
//
// Catégories de base globales (per-tenant) — bridge entre les libellés
// affichés dans l'UI ("À distance", "Sur place", "Déplacement"...) et
// l'enum TimeType technique utilisé par le moteur de facturation.
//
// GET → liste (ordonnée par sortOrder)
// PUT → remplace l'ensemble (sync bulk, admin only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

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

interface IncomingCategory {
  id?: string;
  label: string;
  systemTimeType: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.billingBaseCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return NextResponse.json({ data: rows });
}

export async function PUT(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const incoming = Array.isArray(body.categories)
    ? (body.categories as IncomingCategory[])
    : null;
  if (!incoming) {
    return NextResponse.json(
      { error: "Body { categories: [...] } requis" },
      { status: 400 },
    );
  }
  for (const c of incoming) {
    if (!c.label?.trim()) {
      return NextResponse.json({ error: "label vide" }, { status: 400 });
    }
    if (!VALID_TIME_TYPES.has(c.systemTimeType)) {
      return NextResponse.json(
        { error: `systemTimeType invalide: ${c.systemTimeType}` },
        { status: 400 },
      );
    }
  }

  // Dédup label
  const seen = new Set<string>();
  for (const c of incoming) {
    const k = c.label.trim().toLowerCase();
    if (seen.has(k)) {
      return NextResponse.json(
        { error: `Libellé dupliqué : ${c.label}` },
        { status: 400 },
      );
    }
    seen.add(k);
  }

  const existing = await prisma.billingBaseCategory.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((e) => e.id));
  const incomingIds = new Set(
    incoming.map((c) => c.id).filter((x): x is string => !!x),
  );
  const toDelete = [...existingIds].filter((eid) => !incomingIds.has(eid));

  await prisma.$transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.billingBaseCategory.deleteMany({ where: { id: { in: toDelete } } });
    }
    for (const c of incoming) {
      const data = {
        label: c.label.trim(),
        systemTimeType: c.systemTimeType,
        sortOrder: c.sortOrder ?? 0,
        isActive: c.isActive ?? true,
      };
      if (c.id && existingIds.has(c.id)) {
        await tx.billingBaseCategory.update({ where: { id: c.id }, data });
      } else {
        await tx.billingBaseCategory.create({ data });
      }
    }
  });

  const rows = await prisma.billingBaseCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return NextResponse.json({ data: rows });
}
