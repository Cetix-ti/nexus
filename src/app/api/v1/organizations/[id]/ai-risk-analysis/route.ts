// ============================================================================
// /api/v1/organizations/[id]/ai-risk-analysis
//
// GET  : récupère le dernier snapshot d'analyse de risque (cache AiPattern).
//        Null si jamais analysé.
// POST : lance une nouvelle analyse — scan tous les signaux + appel IA.
//        Réservé SUPERVISOR+ car ça coûte des tokens.
//
// Body POST (optionnel) : { sinceDays?: number (7-180) }
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import {
  analyzeClientRisks,
  getLastRiskAnalysis,
} from "@/lib/ai/features/risk-analysis";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const analysis = await getLastRiskAnalysis(id);
  return NextResponse.json({ analysis });
}

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
    body.sinceDays >= 7 &&
    body.sinceDays <= 180
      ? body.sinceDays
      : 60;

  const analysis = await analyzeClientRisks({
    organizationId: id,
    sinceDays,
  });
  if (!analysis) {
    return NextResponse.json(
      { error: "Analyse impossible." },
      { status: 502 },
    );
  }

  return NextResponse.json({ analysis });
}
