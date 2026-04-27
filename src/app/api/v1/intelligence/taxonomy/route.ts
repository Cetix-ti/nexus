// ============================================================================
// GET /api/v1/intelligence/taxonomy
//
// Liste des paires de catégories quasi-dupliquées détectées par
// `taxonomy-dedup`. Admin uniquement.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getTaxonomyDedupPairs } from "@/lib/ai/jobs/taxonomy-dedup";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET() {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pairs = await getTaxonomyDedupPairs();
  return NextResponse.json({ pairs });
}
