// ============================================================================
// POST /api/v1/ai/cleanup-vocabulary
//
// Nettoie les AiMemory vocabulary déjà stockés qui matchent les patterns de
// junk (UUIDs, hashes, URL-encoded, session IDs) avec le filtre
// `looksLikeJunkToken`. À lancer UNE FOIS après déploiement de la nouvelle
// règle de filtrage. Idempotent.
//
// Body : {} (aucun paramètre)
// Response : { scanned, removed, tokensRemoved[] }
//
// SUPERVISOR+ requis.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { cleanupJunkVocabulary } from "@/lib/ai/jobs/client-vocabulary";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST() {
  const __aiGuard = await requireAiPermission("ai.manage");
  if (!__aiGuard.ok) return __aiGuard.res;
  // me reste accessible si besoin via __aiGuard.me
  const res = await cleanupJunkVocabulary();
  return NextResponse.json(res);
}
