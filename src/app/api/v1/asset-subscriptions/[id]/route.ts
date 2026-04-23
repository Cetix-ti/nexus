import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["vendor", "plan", "reference", "renewalNotes", "notes"]) {
    if (k in body) data[k] = body[k] || null;
  }
  if (body.startDate) data.startDate = new Date(body.startDate);
  if (body.endDate) data.endDate = new Date(body.endDate);
  if ("autoRenew" in body) data.autoRenew = Boolean(body.autoRenew);
  if (body.billingCycle) data.billingCycle = body.billingCycle;
  if ("amount" in body) data.amount = body.amount ?? null;
  if (body.currency) data.currency = body.currency;
  if (body.visibility) data.visibility = body.visibility;
  if ("contractId" in body) data.contractId = body.contractId || null;
  const updated = await prisma.assetSubscription.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.assetSubscription.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
