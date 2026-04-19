// ============================================================================
// POST /api/v1/security-center/incidents/[id]/ai-synthesis
//
// Déclenche une synthèse narrative IA de l'incident — executive summary,
// narratif technique, timeline, hypothèses, impact, actions court/long terme.
// Résultat stocké dans incident.metadata.aiSynthesis. Regénérable à la demande.
//
// Feature typiquement plus coûteuse que le triage (maxTokens 2500, prompt
// plus long) → bouton explicite côté UI. Pas d'auto-trigger à l'ingestion.
//
// TECHNICIAN+ requis.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { synthesizeSecurityIncident } from "@/lib/ai/features/security-incident-synthesis";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "TECHNICIAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.securityIncident.findUnique({
    where: { id },
    select: { id: true, metadata: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Incident introuvable" }, { status: 404 });
  }

  const synthesis = await synthesizeSecurityIncident({ incidentId: id });
  if (!synthesis) {
    return NextResponse.json(
      {
        error:
          "La synthèse IA n'a pas produit de contenu exploitable — réessaye dans un instant.",
      },
      { status: 502 },
    );
  }

  const currentMeta =
    existing.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const nextMeta = {
    ...currentMeta,
    aiSynthesis: {
      ...synthesis,
      generatedAt: new Date().toISOString(),
      generatedBy: me.id,
    },
  };

  await prisma.securityIncident.update({
    where: { id },
    data: { metadata: nextMeta as never },
  });

  return NextResponse.json({
    synthesis,
    generatedAt: nextMeta.aiSynthesis.generatedAt,
  });
}
