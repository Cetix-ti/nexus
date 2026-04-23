import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("vendor" in body) data.vendor = body.vendor || null;
  if ("tier" in body) data.tier = body.tier;
  if (body.startDate) data.startDate = new Date(body.startDate);
  if (body.endDate) data.endDate = new Date(body.endDate);
  if ("contactInfo" in body) data.contactInfo = body.contactInfo ?? null;
  if ("notes" in body) data.notes = body.notes || null;
  if (body.visibility) data.visibility = body.visibility;
  if ("contractId" in body) data.contractId = body.contractId || null;
  const updated = await prisma.assetSupportContract.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.assetSupportContract.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
