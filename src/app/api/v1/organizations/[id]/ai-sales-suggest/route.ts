// ============================================================================
// POST /api/v1/organizations/[id]/ai-sales-suggest
//
// Extrait des opportunités commerciales à partir des données opérationnelles.
// Réservé SUPERVISOR+ (coût IA + pilotage commercial).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { suggestSalesOpportunities } from "@/lib/ai/features/sales-suggest";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const sinceDays =
    typeof body.sinceDays === "number" &&
    body.sinceDays >= 30 &&
    body.sinceDays <= 365
      ? body.sinceDays
      : 90;

  const suggestions = await suggestSalesOpportunities({
    organizationId: id,
    sinceDays,
  });
  if (!suggestions) {
    return NextResponse.json(
      { error: "Analyse impossible." },
      { status: 502 },
    );
  }

  return NextResponse.json({ suggestions });
}
