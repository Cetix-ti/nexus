// ============================================================================
// /api/v1/sites/[id]/vlans
// Liste et crée les VLANs d'un site.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN" || role === "TECHNICIAN";
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const vlans = await prisma.siteVlan.findMany({
    where: { siteId: id },
    orderBy: { vlanId: "asc" },
  });
  return NextResponse.json({ data: vlans });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const vlanId = Number(body?.vlanId);
  if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
    return NextResponse.json({ error: "VLAN ID doit être entre 1 et 4094" }, { status: 400 });
  }
  if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name requis" }, { status: 400 });
  }
  const vlan = await prisma.siteVlan.create({
    data: {
      siteId: id,
      vlanId,
      name: body.name.trim(),
      dhcpServer: body.dhcpServer?.trim() || null,
      dnsPrimary: body.dnsPrimary?.trim() || null,
      dnsSecondary: body.dnsSecondary?.trim() || null,
      description: body.description?.trim() || null,
    },
  });
  return NextResponse.json({ data: vlan });
}
