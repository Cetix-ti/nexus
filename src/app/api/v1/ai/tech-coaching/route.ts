// ============================================================================
// POST /api/v1/ai/tech-coaching
//
// Génère un rapport de coaching d'équipe à partir des données
// opérationnelles agrégées (pas de tracking individuel). Réservé
// SUPERVISOR+.
//
// Body (optionnel) : { sinceDays?: number (30-180) }
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { generateTechCoachingReport } from "@/lib/ai/features/tech-coaching";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const sinceDays =
    typeof body.sinceDays === "number" &&
    body.sinceDays >= 30 &&
    body.sinceDays <= 180
      ? body.sinceDays
      : 60;

  const report = await generateTechCoachingReport({ sinceDays });
  if (!report) {
    return NextResponse.json(
      { error: "Génération impossible." },
      { status: 502 },
    );
  }
  return NextResponse.json({ report });
}
