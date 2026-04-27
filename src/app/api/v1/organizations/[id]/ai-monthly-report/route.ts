// ============================================================================
// POST /api/v1/organizations/[id]/ai-monthly-report
//
// Génère un rapport mensuel client. Body (optionnel) : { year, month }.
// Défaut : mois précédent complet.
//
// Réservé SUPERVISOR+ (coût IA + rapport destiné à un décideur externe).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAiPermission } from "@/lib/permissions/ai-guard";
import { generateMonthlyReport } from "@/lib/ai/features/monthly-report";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Génération de rapport → ai.run_jobs (consomme tokens + livrable client)
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
  const year =
    typeof body.year === "number" && body.year >= 2020 && body.year <= 2100
      ? body.year
      : undefined;
  const month =
    typeof body.month === "number" && body.month >= 1 && body.month <= 12
      ? body.month
      : undefined;

  const report = await generateMonthlyReport({
    organizationId: id,
    year,
    month,
  });
  if (!report) {
    return NextResponse.json(
      { error: "Génération du rapport impossible." },
      { status: 502 },
    );
  }

  return NextResponse.json({ report });
}
