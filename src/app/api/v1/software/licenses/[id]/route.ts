import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("licenseKey" in body) data.licenseKey = body.licenseKey || null;
  if ("seats" in body) data.seats = body.seats ?? null;
  if ("usedSeats" in body) data.usedSeats = body.usedSeats ?? null;
  if ("startDate" in body) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if ("endDate" in body) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if ("notes" in body) data.notes = body.notes || null;
  if (body.visibility && VIS.includes(body.visibility)) data.visibility = body.visibility;
  if ("contactId" in body) data.contactId = body.contactId || null;
  if ("assetId" in body) data.assetId = body.assetId || null;
  if ("contractId" in body) data.contractId = body.contractId || null;

  const updated = await prisma.softwareLicense.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.softwareLicense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
