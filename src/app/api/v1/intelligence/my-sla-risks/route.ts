// ============================================================================
// GET /api/v1/intelligence/my-sla-risks
//
// Retourne les tickets du user connecté (assigné) qui ont un risk score
// SLA ≥ 0.6, triés par urgence. Consommé par la bannière sur /tickets.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getSlaRisksForUser } from "@/lib/ai/jobs/sla-drift-predictor";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET() {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  const risks = await getSlaRisksForUser(me.id);
  const relevant = risks.filter((r) => r.riskScore >= 0.6).slice(0, 10);
  return NextResponse.json({ risks: relevant });
}
