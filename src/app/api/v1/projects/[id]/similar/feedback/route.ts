// ============================================================================
// /api/v1/projects/[id]/similar/feedback
//
// POST { suggestedProjectId, verdict: "good" | "bad" }
//   Enregistre (upsert) le feedback d'un humain sur une suggestion IA.
//   "bad" filtre la suggestion des prochaines réponses. "good" la boost.
//
// DELETE ?suggestedProjectId=xxx  → retire un feedback (undo).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.suggestedProjectId || (body.verdict !== "good" && body.verdict !== "bad")) {
    return NextResponse.json({ error: "suggestedProjectId + verdict requis" }, { status: 400 });
  }
  const row = await prisma.projectSimilarFeedback.upsert({
    where: {
      projectId_suggestedProjectId: {
        projectId: id,
        suggestedProjectId: String(body.suggestedProjectId),
      },
    },
    create: {
      projectId: id,
      suggestedProjectId: String(body.suggestedProjectId),
      verdict: body.verdict,
      userId: me.id,
    },
    update: {
      verdict: body.verdict,
      userId: me.id,
    },
  });
  return NextResponse.json({ data: row });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const suggestedProjectId = req.nextUrl.searchParams.get("suggestedProjectId");
  if (!suggestedProjectId) {
    return NextResponse.json({ error: "suggestedProjectId requis" }, { status: 400 });
  }
  await prisma.projectSimilarFeedback.deleteMany({
    where: { projectId: id, suggestedProjectId },
  });
  return NextResponse.json({ success: true });
}
