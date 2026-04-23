import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";

async function loadAndAuthorize(me: { id: string; role: string }, id: string) {
  const existing = await prisma.assetWarranty.findUnique({ where: { id }, select: { organizationId: true } });
  if (!existing) return { ok: false as const, res: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const guard = await assertSameOrg(me as never, existing.organizationId);
  if (!guard.ok) return { ok: false as const, res: guard.res };
  return { ok: true as const };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const chk = await loadAndAuthorize(me, id);
  if (!chk.ok) return chk.res;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("vendor" in body) data.vendor = body.vendor || null;
  if ("reference" in body) data.reference = body.reference || null;
  if (body.startDate) data.startDate = new Date(body.startDate);
  if (body.endDate) data.endDate = new Date(body.endDate);
  if (body.coverageLevel) data.coverageLevel = body.coverageLevel;
  if ("notes" in body) data.notes = body.notes || null;
  if ("contractId" in body) data.contractId = body.contractId || null;
  if (body.visibility) data.visibility = body.visibility;
  const updated = await prisma.assetWarranty.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const chk = await loadAndAuthorize(me, id);
  if (!chk.ok) return chk.res;
  await prisma.assetWarranty.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
