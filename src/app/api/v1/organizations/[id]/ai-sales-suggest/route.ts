// ============================================================================
// POST /api/v1/organizations/[id]/ai-sales-suggest
//
// Extrait des opportunités commerciales à partir des données opérationnelles.
// Réservé SUPERVISOR+ (coût IA + pilotage commercial).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAiPermission } from "@/lib/permissions/ai-guard";
import { suggestSalesOpportunities } from "@/lib/ai/features/sales-suggest";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Suggestions ventes → ai.run_jobs
  const guard = await requireAiPermission("ai.run_jobs");
  if (!guard.ok) return guard.res;
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
