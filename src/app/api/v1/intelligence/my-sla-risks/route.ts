// ============================================================================
// GET /api/v1/intelligence/my-sla-risks
//
// Retourne les tickets du user connecté (assigné) qui ont un risk score
// SLA ≥ 0.6, triés par urgence. Consommé par la bannière sur /tickets.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getSlaRisksForUser } from "@/lib/ai/jobs/sla-drift-predictor";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const risks = await getSlaRisksForUser(me.id);
  const relevant = risks.filter((r) => r.riskScore >= 0.6).slice(0, 10);
  return NextResponse.json({ risks: relevant });
}
