// ============================================================================
// POST /api/v1/tickets/[id]/similar/feedback
//
// Feedback EXPLICITE du tech sur une suggestion de ticket similaire :
//   - verdict="bad"  : la suggestion n'a pas de rapport → filtre l'item
//                      pour ce viewer + alimente un down-weight global.
//   - verdict="good" : confirme que la suggestion est pertinente → renforce.
//
// Stocké par paire (source, suggéré) dans AiPattern
// (scope="similar:feedback", kind="pair", key=`${sourceId}|${suggestedId}`).
// Le scorer lit ces feedbacks à chaque requête et applique un boost/
// penalty AVANT le tri.
//
// Dédup : le dernier verdict écrase le précédent (tech peut corriger son avis).
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

  const { id: sourceTicketId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    suggestedTicketId?: string;
    bucket?: string;
    verdict?: "bad" | "good";
  };
  if (!body.suggestedTicketId || !body.verdict) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (body.verdict !== "bad" && body.verdict !== "good") {
    return NextResponse.json({ error: "Invalid verdict" }, { status: 400 });
  }

  const key = `${sourceTicketId}|${body.suggestedTicketId}`;
  await prisma.aiPattern.upsert({
    where: {
      scope_kind_key: {
        scope: "similar:feedback",
        kind: "pair",
        key,
      },
    },
    create: {
      scope: "similar:feedback",
      kind: "pair",
      key,
      value: {
        sourceTicketId,
        suggestedTicketId: body.suggestedTicketId,
        bucket: body.bucket ?? null,
        verdict: body.verdict,
        userId: me.id,
        markedAt: new Date().toISOString(),
      } as never,
      sampleCount: 1,
      confidence: body.verdict === "bad" ? 1 : 0.8,
    },
    update: {
      value: {
        sourceTicketId,
        suggestedTicketId: body.suggestedTicketId,
        bucket: body.bucket ?? null,
        verdict: body.verdict,
        userId: me.id,
        markedAt: new Date().toISOString(),
      } as never,
      confidence: body.verdict === "bad" ? 1 : 0.8,
    },
  });

  return NextResponse.json({ ok: true });
}
