// ============================================================================
// POST /api/v1/ai/kb-audit
//
// Lance un audit IA de la base de connaissances et retourne un rapport
// structuré avec suggestions (structure + articles). Ne mute RIEN — l'UI
// présente les suggestions avec boutons "Appliquer" / "Ignorer".
//
// Réservé SUPERVISOR+ — restructurer la KB est une décision éditoriale.
// Coût : 1 appel IA (gemma3:12b local = 0 $, ou ~0.02 $ avec OpenAI).
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { auditKbTaxonomy } from "@/lib/ai/features/kb-audit";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST() {
  const __aiGuard = await requireAiPermission("ai.manage");
  if (!__aiGuard.ok) return __aiGuard.res;
  // me reste accessible si besoin via __aiGuard.me
  try {
    const report = await auditKbTaxonomy();
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur IA" },
      { status: 500 },
    );
  }
}
