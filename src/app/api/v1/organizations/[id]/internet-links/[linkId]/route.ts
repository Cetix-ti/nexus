// ============================================================================
// PATCH / DELETE /api/v1/organizations/[id]/internet-links/[linkId]
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string; linkId: string }>; }

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN" || role === "TECHNICIAN";
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, linkId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.siteId !== undefined) data.siteId = body.siteId || null;
  if (body.isp !== undefined) data.isp = String(body.isp).trim();
  if (body.label !== undefined) data.label = body.label?.trim() || null;
  if (body.downloadMbps !== undefined) {
    data.downloadMbps = body.downloadMbps === "" || body.downloadMbps == null ? null : Number(body.downloadMbps);
  }
  if (body.uploadMbps !== undefined) {
    data.uploadMbps = body.uploadMbps === "" || body.uploadMbps == null ? null : Number(body.uploadMbps);
  }
  if (body.gateway !== undefined) data.gateway = body.gateway?.trim() || null;
  if (body.dnsPrimary !== undefined) data.dnsPrimary = body.dnsPrimary?.trim() || null;
  if (body.dnsSecondary !== undefined) data.dnsSecondary = body.dnsSecondary?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  const link = await prisma.orgInternetLink.update({
    where: { id: linkId, organizationId: id },
    data,
    include: { ipBlocks: true },
  });
  return NextResponse.json({ data: link });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, linkId } = await ctx.params;
  await prisma.orgInternetLink.deleteMany({ where: { id: linkId, organizationId: id } });
  return NextResponse.json({ success: true });
}
