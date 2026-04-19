// ============================================================================
// POST /api/v1/tickets/[id]/ai-kb-draft
//
// Génère un brouillon d'article KB à partir d'un ticket résolu. Retourne
// le brouillon — l'admin l'édite ensuite via le formulaire KB standard.
// Ne CRÉE PAS l'article en DB : c'est une proposition pure.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { generateKbDraft } from "@/lib/ai/features/kb-gen";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  const draft = await generateKbDraft(id);
  if (!draft) {
    return NextResponse.json(
      {
        error:
          "Pas assez de contenu pour proposer un article KB — ce ticket est peut-être trop court ou trop spécifique.",
      },
      { status: 422 },
    );
  }

  const invocation = await prisma.aiInvocation.findFirst({
    where: { ticketId: id, feature: "kb_gen" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return NextResponse.json({ draft, invocationId: invocation?.id });
}
