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

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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
