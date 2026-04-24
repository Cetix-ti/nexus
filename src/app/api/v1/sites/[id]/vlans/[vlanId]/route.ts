// ============================================================================
// PATCH / DELETE /api/v1/sites/[id]/vlans/[vlanId]
// Note: [id] = siteId · [vlanId] = ID de ligne (cuid), pas le 802.1Q.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string; vlanId: string }>; }

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN" || role === "TECHNICIAN";
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: siteId, vlanId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.vlanId !== undefined) {
    const n = Number(body.vlanId);
    if (!Number.isInteger(n) || n < 1 || n > 4094) {
      return NextResponse.json({ error: "VLAN ID doit être entre 1 et 4094" }, { status: 400 });
    }
    data.vlanId = n;
  }
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.dhcpServer !== undefined) data.dhcpServer = body.dhcpServer?.trim() || null;
  if (body.dnsPrimary !== undefined) data.dnsPrimary = body.dnsPrimary?.trim() || null;
  if (body.dnsSecondary !== undefined) data.dnsSecondary = body.dnsSecondary?.trim() || null;
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  const vlan = await prisma.siteVlan.update({
    where: { id: vlanId, siteId },
    data,
  });
  return NextResponse.json({ data: vlan });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: siteId, vlanId } = await ctx.params;
  await prisma.siteVlan.deleteMany({ where: { id: vlanId, siteId } });
  return NextResponse.json({ success: true });
}
