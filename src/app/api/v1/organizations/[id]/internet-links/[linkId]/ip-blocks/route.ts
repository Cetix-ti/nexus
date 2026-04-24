// ============================================================================
// POST /api/v1/organizations/[id]/internet-links/[linkId]/ip-blocks
// Crée un bloc IP (SINGLE | RANGE | SUBNET) sur un lien existant.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string; linkId: string }>; }

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN" || role === "TECHNICIAN";
}

const KINDS = new Set(["SINGLE", "RANGE", "SUBNET"]);

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, linkId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  if (!KINDS.has(kind)) return NextResponse.json({ error: "kind invalide" }, { status: 400 });
  if (!body?.value || typeof body.value !== "string" || !body.value.trim()) {
    return NextResponse.json({ error: "value requis" }, { status: 400 });
  }
  // Vérifie que le lien appartient bien à l'organisation
  const link = await prisma.orgInternetLink.findFirst({
    where: { id: linkId, organizationId: id },
    select: { id: true },
  });
  if (!link) return NextResponse.json({ error: "Lien introuvable" }, { status: 404 });

  const block = await prisma.orgIpBlock.create({
    data: {
      linkId,
      kind,
      value: body.value.trim(),
      label: body.label?.trim() || null,
    },
  });
  return NextResponse.json({ data: block });
}
