// ============================================================================
// GET /api/v1/intelligence/taxonomy
//
// Liste des paires de catégories quasi-dupliquées détectées par
// `taxonomy-dedup`. Admin uniquement.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getTaxonomyDedupPairs } from "@/lib/ai/jobs/taxonomy-dedup";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pairs = await getTaxonomyDedupPairs();
  return NextResponse.json({ pairs });
}
