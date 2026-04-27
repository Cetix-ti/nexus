// POST /api/v1/ai/audit-categories
//
// Demande à l'IA d'auditer la taxonomie actuelle des catégories. Retourne
// un rapport { summary, suggestions[] } où chaque suggestion propose
// d'ajouter, re-hiérarchiser ou renommer une catégorie. L'application
// des suggestions reste manuelle côté UI (ne mute pas la DB).
//
// POST (pas GET) parce que ça coûte un appel OpenAI par invocation.
// Réservé aux agents MSP+.

import { NextResponse } from "next/server";
import { auditCategoryTaxonomy } from "@/lib/ai/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST() {
  const __aiGuard = await requireAiPermission("ai.manage");
  if (!__aiGuard.ok) return __aiGuard.res;
  // me reste accessible si besoin via __aiGuard.me
  try {
    const report = await auditCategoryTaxonomy();
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur IA" },
      { status: 500 },
    );
  }
}
