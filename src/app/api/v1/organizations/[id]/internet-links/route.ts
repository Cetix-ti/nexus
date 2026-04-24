// ============================================================================
// /api/v1/organizations/[id]/internet-links
//
// Liens Internet d'un client (ISP, débit, gateway, DNS) + leurs blocs IP
// publics associés. Un lien est optionnellement rattaché à un site.
// GET = liste complète (avec ipBlocks) · POST = crée un nouveau lien.
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
  const links = await prisma.orgInternetLink.findMany({
    where: { organizationId: id },
    include: { ipBlocks: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ siteId: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ data: links });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body?.isp || typeof body.isp !== "string" || !body.isp.trim()) {
    return NextResponse.json({ error: "isp requis" }, { status: 400 });
  }
  const link = await prisma.orgInternetLink.create({
    data: {
      organizationId: id,
      siteId: body.siteId || null,
      isp: body.isp.trim(),
      label: body.label?.trim() || null,
      downloadMbps: body.downloadMbps != null && body.downloadMbps !== "" ? Number(body.downloadMbps) : null,
      uploadMbps: body.uploadMbps != null && body.uploadMbps !== "" ? Number(body.uploadMbps) : null,
      gateway: body.gateway?.trim() || null,
      dnsPrimary: body.dnsPrimary?.trim() || null,
      dnsSecondary: body.dnsSecondary?.trim() || null,
      notes: body.notes?.trim() || null,
    },
    include: { ipBlocks: true },
  });
  return NextResponse.json({ data: link });
}
