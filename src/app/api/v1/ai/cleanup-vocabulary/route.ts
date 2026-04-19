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

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const res = await cleanupJunkVocabulary();
  return NextResponse.json(res);
}
