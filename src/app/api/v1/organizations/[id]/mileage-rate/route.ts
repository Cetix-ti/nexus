// ============================================================================
// /api/v1/organizations/[id]/mileage-rate
//
// Configuration de facturation du déplacement pour un client. Un seul enreg
// par org (unique). PUT = upsert. Admin uniquement.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN";
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await prisma.orgMileageRate.findUnique({
    where: { organizationId: id },
  });
  return NextResponse.json({ data: row });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const kmRoundTrip = Number(body.kmRoundTrip);
  if (!Number.isFinite(kmRoundTrip) || kmRoundTrip < 0) {
    return NextResponse.json({ error: "kmRoundTrip invalide" }, { status: 400 });
  }
  // flatFee : si défini (nombre ≥ 0), on facture un montant fixe par
  // déplacement (remplace km A/R × taux global). null ou absent = mode
  // kilométrique classique.
  let flatFee: number | null | undefined = undefined;
  if (body.flatFee === null || body.flatFee === "") {
    flatFee = null;
  } else if (body.flatFee != null) {
    const f = Number(body.flatFee);
    if (!Number.isFinite(f) || f < 0) {
      return NextResponse.json({ error: "flatFee invalide" }, { status: 400 });
    }
    flatFee = f;
  }

  const row = await prisma.orgMileageRate.upsert({
    where: { organizationId: id },
    create: {
      organizationId: id,
      kmRoundTrip,
      billToClient: body.billToClient !== false,
      agentRatePerKm:
        body.agentRatePerKm != null ? Number(body.agentRatePerKm) : 0.55,
      flatFee: flatFee ?? null,
    },
    update: {
      kmRoundTrip,
      billToClient: body.billToClient !== false,
      agentRatePerKm:
        body.agentRatePerKm != null ? Number(body.agentRatePerKm) : undefined,
      // undefined = ne pas toucher, null = effacer le forfait
      ...(flatFee !== undefined ? { flatFee } : {}),
    },
  });
  return NextResponse.json({ data: row });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await prisma.orgMileageRate.deleteMany({ where: { organizationId: id } });
  return NextResponse.json({ success: true });
}
