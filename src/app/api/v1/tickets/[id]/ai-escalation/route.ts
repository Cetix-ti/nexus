// ============================================================================
// POST /api/v1/tickets/[id]/ai-escalation
//
// Génère un brief d'escalade à partir de l'historique du ticket. Non
// destructif — l'UI affiche le résultat dans un drawer, le tech copie dans
// un commentaire interne ou un courriel. Pas de re-assignement auto.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { generateEscalationBrief } from "@/lib/ai/features/escalation-brief";

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

  const result = await generateEscalationBrief(id);
  if (!result) {
    return NextResponse.json(
      { error: "Génération impossible — historique insuffisant ?" },
      { status: 502 },
    );
  }

  const invocation = await prisma.aiInvocation.findFirst({
    where: { ticketId: id, feature: "escalation_brief" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return NextResponse.json({ result, invocationId: invocation?.id });
}
