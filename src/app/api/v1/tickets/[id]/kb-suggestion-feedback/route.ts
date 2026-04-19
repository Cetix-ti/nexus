// ============================================================================
// POST /api/v1/tickets/[id]/kb-suggestion-feedback
//
// Feedback EXPLICITE du tech sur une suggestion d'article KB :
//   - verdict="bad"  : l'article proposé n'est pas pertinent
//   - verdict="good" : confirme la pertinence
//
// Stocké dans AiPattern(scope="kb:feedback", kind="pair",
// key="<ticketId>|<articleId>"). Lu par le helper
// `suggestKbArticlesForTicket` pour filtrer les articles marqués "bad" et
// booster les "good".
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
    articleId?: string;
    verdict?: "bad" | "good";
  };
  if (!body.articleId || !body.verdict) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (body.verdict !== "bad" && body.verdict !== "good") {
    return NextResponse.json({ error: "Invalid verdict" }, { status: 400 });
  }

  const key = `${ticketId}|${body.articleId}`;
  await prisma.aiPattern.upsert({
    where: {
      scope_kind_key: {
        scope: "kb:feedback",
        kind: "pair",
        key,
      },
    },
    create: {
      scope: "kb:feedback",
      kind: "pair",
      key,
      value: {
        ticketId,
        articleId: body.articleId,
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
        articleId: body.articleId,
        verdict: body.verdict,
        userId: me.id,
        markedAt: new Date().toISOString(),
      } as never,
      confidence: body.verdict === "bad" ? 1 : 0.8,
    },
  });

  return NextResponse.json({ ok: true });
}
