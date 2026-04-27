// ============================================================================
// GET /api/v1/intelligence/kb-proposed
//
// File de review des articles KB proposés par l'IA — brouillons (DRAFT) dont
// `externalSource` commence par `ai:`. Couvre :
//   - kb-gaps drafter (ai:kb_gen:kb-gaps)
//   - playbook-miner (ai:playbook)
//   - futures sources IA
//
// L'admin peut approuver (→ PUBLISHED) ou rejeter (→ ARCHIVED) via
// POST /kb-proposed/[id]/action. L'édition fine passe par /knowledge/[slug].
//
// SUPERVISOR+ requis — ne montre pas les drafts humains pour éviter le bruit.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET() {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  // me reste accessible si besoin via __aiGuard.me
  const articles = await prisma.article.findMany({
    where: {
      status: "DRAFT",
      externalSource: { startsWith: "ai:" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      body: true,
      tags: true,
      externalSource: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
    },
  });

  // Agrège par source pour stats.
  const bySource: Record<string, number> = {};
  for (const a of articles) {
    const s = a.externalSource ?? "ai:unknown";
    bySource[s] = (bySource[s] ?? 0) + 1;
  }

  return NextResponse.json({
    total: articles.length,
    bySource,
    articles,
  });
}
