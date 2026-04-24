// ============================================================================
// /api/v1/billing/addons — catalogue des abonnements supplémentaires
// (services connexes). Admin/facturation uniquement.
//
// GET    → liste (avec compteurs d'orgs qui utilisent chaque addon).
// POST   → création { name, description, defaultMonthlyPrice, active }.
// PATCH  → mise à jour { id, ...patch }.
// DELETE ?id=xxx → suppression en cascade des assignations.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

function canManage(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN";
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role) && me.role !== "SUPERVISOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.billingAddon.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { organizationAddons: { where: { active: true } } } },
    },
  });
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      defaultMonthlyPrice: r.defaultMonthlyPrice,
      active: r.active,
      sortOrder: r.sortOrder,
      usageCount: r._count.organizationAddons,
    })),
  });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!body?.name || body?.defaultMonthlyPrice == null) {
    return NextResponse.json(
      { error: "name et defaultMonthlyPrice requis" },
      { status: 400 },
    );
  }
  const last = await prisma.billingAddon.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const row = await prisma.billingAddon.create({
    data: {
      name: String(body.name).trim(),
      description: body.description ? String(body.description) : null,
      defaultMonthlyPrice: Number(body.defaultMonthlyPrice),
      active: body.active !== false,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  return NextResponse.json({ data: row });
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.description !== undefined)
    data.description = body.description ? String(body.description) : null;
  if (body.defaultMonthlyPrice !== undefined)
    data.defaultMonthlyPrice = Number(body.defaultMonthlyPrice);
  if (body.active !== undefined) data.active = !!body.active;
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);
  const row = await prisma.billingAddon.update({
    where: { id: String(body.id) },
    data,
  });
  return NextResponse.json({ data: row });
}

export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await prisma.billingAddon.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
