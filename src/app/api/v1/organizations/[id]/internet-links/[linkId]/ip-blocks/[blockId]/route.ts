// ============================================================================
// PATCH / DELETE /api/v1/organizations/[id]/internet-links/[linkId]/ip-blocks/[blockId]
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string; linkId: string; blockId: string }>; }

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN" || role === "TECHNICIAN";
}

const KINDS = new Set(["SINGLE", "RANGE", "SUBNET"]);

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, linkId, blockId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.kind !== undefined) {
    if (!KINDS.has(body.kind)) return NextResponse.json({ error: "kind invalide" }, { status: 400 });
    data.kind = body.kind;
  }
  if (body.value !== undefined) data.value = String(body.value).trim();
  if (body.label !== undefined) data.label = body.label?.trim() || null;

  // Contrôle d'appartenance
  const existing = await prisma.orgIpBlock.findFirst({
    where: { id: blockId, linkId, link: { organizationId: id } },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Bloc introuvable" }, { status: 404 });

  const block = await prisma.orgIpBlock.update({ where: { id: blockId }, data });
  return NextResponse.json({ data: block });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, linkId, blockId } = await ctx.params;
  await prisma.orgIpBlock.deleteMany({
    where: { id: blockId, linkId, link: { organizationId: id } },
  });
  return NextResponse.json({ success: true });
}
