// ============================================================================
// /api/v1/users/[id]/allowances
//
// CRUD pour les allocations récurrentes (cellulaire, internet, etc.) versées
// à un agent via Mes dépenses. Un agent peut voir ses propres allocations ;
// seuls SUPER_ADMIN et MSP_ADMIN peuvent les modifier.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN";
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (me.id !== id && !canEdit(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await prisma.agentAllowance.findMany({
    where: { userId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.label || body?.amountMonthly == null) {
    return NextResponse.json({ error: "label et amountMonthly requis" }, { status: 400 });
  }
  const row = await prisma.agentAllowance.create({
    data: {
      userId: id,
      label: String(body.label).trim(),
      amountMonthly: Number(body.amountMonthly),
      active: body.active !== false,
    },
  });
  return NextResponse.json({ data: row });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = String(body.label).trim();
  if (body.amountMonthly !== undefined) data.amountMonthly = Number(body.amountMonthly);
  if (body.active !== undefined) data.active = !!body.active;
  const { id } = await ctx.params;
  const row = await prisma.agentAllowance.update({
    where: { id: String(body.id) },
    data,
  });
  if (row.userId !== id) {
    return NextResponse.json({ error: "Mismatch userId/allowance" }, { status: 400 });
  }
  return NextResponse.json({ data: row });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const allowanceId = req.nextUrl.searchParams.get("allowanceId");
  if (!allowanceId) return NextResponse.json({ error: "allowanceId requis" }, { status: 400 });
  await prisma.agentAllowance.deleteMany({
    where: { id: allowanceId, userId: id },
  });
  return NextResponse.json({ success: true });
}
