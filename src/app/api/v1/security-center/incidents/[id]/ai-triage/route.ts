// ============================================================================
// POST /api/v1/security-center/incidents/[id]/ai-triage
//
// Déclenche un triage IA sur l'incident — classification MITRE, sévérité
// suggérée, probabilité FP, actions recommandées. Stocke le résultat dans
// incident.metadata.aiTriage (avec timestamp + invocationId pour humanAction).
//
// Pas d'action automatique : le triage est UNE PROPOSITION. L'analyste SOC
// décide quoi appliquer. Les rejets alimentent le feedback loop IA.
//
// TECHNICIAN+ requis (analystes SOC sont typiquement TECHNICIAN ou supérieur).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { triageSecurityIncident } from "@/lib/ai/features/security-incident-triage";

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

  const triage = await triageSecurityIncident({ incidentId: id });
  if (!triage) {
    return NextResponse.json(
      {
        error:
          "Le triage IA n'a pas produit de résultat exploitable — réessaye dans un instant.",
      },
      { status: 502 },
    );
  }

  // On mémorise le résultat pour que l'UI l'affiche sans re-invoquer l'IA
  // à chaque ouverture de fiche. La regénération est explicite (bouton).
  const currentMeta =
    existing.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const nextMeta = {
    ...currentMeta,
    aiTriage: {
      ...triage,
      generatedAt: new Date().toISOString(),
      generatedBy: me.id,
    },
  };

  await prisma.securityIncident.update({
    where: { id },
    data: { metadata: nextMeta as never },
  });

  return NextResponse.json({
    triage,
    generatedAt: nextMeta.aiTriage.generatedAt,
  });
}
