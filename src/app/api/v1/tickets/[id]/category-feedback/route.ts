// ============================================================================
// POST /api/v1/tickets/[id]/category-feedback
//
// Feedback EXPLICITE du tech sur une suggestion de CATÉGORIE produite par
// le triage IA :
//   - verdict="bad"  : la catégorie proposée est hors sujet
//   - verdict="good" : la catégorie est pertinente
//
// Stocké dans AiPattern(scope="category:feedback", kind="pair",
// key="<ticketId>|<suggestedCategoryId>"). Le job
// category-feedback-learner agrège ces entrées pour pénaliser les mappings
// (token → catégorie) qui génèrent beaucoup de faux positifs.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: ticketId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    suggestedCategoryId?: string;
    verdict?: "bad" | "good";
  };
  if (!body.suggestedCategoryId || !body.verdict) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (body.verdict !== "bad" && body.verdict !== "good") {
    return NextResponse.json({ error: "Invalid verdict" }, { status: 400 });
  }

  const key = `${ticketId}|${body.suggestedCategoryId}`;
  await prisma.aiPattern.upsert({
    where: {
      scope_kind_key: {
        scope: "category:feedback",
        kind: "pair",
        key,
      },
    },
    create: {
      scope: "category:feedback",
      kind: "pair",
      key,
      value: {
        ticketId,
        suggestedCategoryId: body.suggestedCategoryId,
        verdict: body.verdict,
        userId: me.id,
        markedAt: new Date().toISOString(),
      } as never,
      sampleCount: 1,
      confidence: body.verdict === "bad" ? 1 : 0.8,
    },
    update: {
      value: {
        ticketId,
        suggestedCategoryId: body.suggestedCategoryId,
        verdict: body.verdict,
        userId: me.id,
        markedAt: new Date().toISOString(),
      } as never,
      confidence: body.verdict === "bad" ? 1 : 0.8,
    },
  });

  return NextResponse.json({ ok: true });
}
