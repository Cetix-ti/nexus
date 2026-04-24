// ============================================================================
// /api/v1/organizations/[id]/addons
//
// Gère les abonnements supplémentaires (catalogue BillingAddon) souscrits
// par une organisation. Le prix par défaut vient du catalogue mais peut
// être écrasé au niveau de l'assignation (monthlyPrice).
//
// GET  → liste des addons actifs (enrichie avec prix effectif).
// POST → attache un addon (ou update si déjà attaché).
// PATCH { id, ...patch } → modifie l'assignation (prix, quantity, notes).
// DELETE ?assignmentId=xxx → retire l'addon.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

function canManage(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN";
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const rows = await prisma.organizationAddon.findMany({
    where: { organizationId: id },
    include: {
      addon: {
        select: {
          id: true,
          name: true,
          description: true,
          defaultMonthlyPrice: true,
          active: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    data: rows.map((r) => {
      const effectiveUnitPrice = r.monthlyPrice ?? r.addon.defaultMonthlyPrice;
      return {
        id: r.id,
        addonId: r.addonId,
        name: r.addon.name,
        description: r.addon.description ?? "",
        defaultMonthlyPrice: r.addon.defaultMonthlyPrice,
        monthlyPrice: r.monthlyPrice,
        effectiveUnitPrice,
        quantity: r.quantity,
        effectiveTotal: effectiveUnitPrice * r.quantity,
        isPriceOverridden: r.monthlyPrice !== null,
        startDate: r.startDate?.toISOString() ?? null,
        endDate: r.endDate?.toISOString() ?? null,
        notes: r.notes ?? "",
        active: r.active,
        addonActive: r.addon.active,
      };
    }),
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.addonId) {
    return NextResponse.json({ error: "addonId requis" }, { status: 400 });
  }
  // Upsert : si l'addon est déjà assigné à l'org, on l'update.
  const row = await prisma.organizationAddon.upsert({
    where: {
      organizationId_addonId: {
        organizationId: id,
        addonId: String(body.addonId),
      },
    },
    create: {
      organizationId: id,
      addonId: String(body.addonId),
      quantity: body.quantity ? Number(body.quantity) : 1,
      monthlyPrice: body.monthlyPrice != null ? Number(body.monthlyPrice) : null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      notes: body.notes ? String(body.notes) : null,
      active: body.active !== false,
    },
    update: {
      quantity: body.quantity ? Number(body.quantity) : undefined,
      monthlyPrice: body.monthlyPrice !== undefined
        ? (body.monthlyPrice === null ? null : Number(body.monthlyPrice))
        : undefined,
      startDate: body.startDate !== undefined
        ? (body.startDate ? new Date(body.startDate) : null)
        : undefined,
      endDate: body.endDate !== undefined
        ? (body.endDate ? new Date(body.endDate) : null)
        : undefined,
      notes: body.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined,
      active: body.active !== undefined ? !!body.active : undefined,
    },
  });
  return NextResponse.json({ data: row });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (body.quantity !== undefined) data.quantity = Number(body.quantity);
  if (body.monthlyPrice !== undefined) {
    data.monthlyPrice =
      body.monthlyPrice === null || body.monthlyPrice === ""
        ? null
        : Number(body.monthlyPrice);
  }
  if (body.startDate !== undefined)
    data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined)
    data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.notes !== undefined)
    data.notes = body.notes ? String(body.notes) : null;
  if (body.active !== undefined) data.active = !!body.active;

  // Vérifie que l'assignation appartient bien à cette org (sécurité).
  const existing = await prisma.organizationAddon.findUnique({
    where: { id: String(body.id) },
    select: { organizationId: true },
  });
  if (!existing || existing.organizationId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await prisma.organizationAddon.update({
    where: { id: String(body.id) },
    data,
  });
  return NextResponse.json({ data: row });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const assignmentId = req.nextUrl.searchParams.get("assignmentId");
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId requis" }, { status: 400 });
  }
  await prisma.organizationAddon.deleteMany({
    where: { id: assignmentId, organizationId: id },
  });
  return NextResponse.json({ success: true });
}
