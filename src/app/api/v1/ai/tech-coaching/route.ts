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
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  // me reste accessible si besoin via __aiGuard.me
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
