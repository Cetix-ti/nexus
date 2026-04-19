// ============================================================================
// POST /api/v1/tickets/[id]/ai-resolution
//
// Génère une note de résolution IA (interne + client) à partir de
// l'historique du ticket. Appelé depuis la fiche ticket au moment de
// fermer / résoudre : l'agent visualise les deux versions, édite, puis
// utilise ce qu'il veut dans le composer ou la note de fermeture.
//
// Ne MODIFIE PAS le ticket. C'est une suggestion.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { generateResolutionNotes } from "@/lib/ai/features/resolution-notes";

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

  const result = await generateResolutionNotes(id);
  if (!result) {
    return NextResponse.json(
      { error: "Génération impossible — historique insuffisant ?" },
      { status: 502 },
    );
  }

  const invocation = await prisma.aiInvocation.findFirst({
    where: { ticketId: id, feature: "resolution_notes" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return NextResponse.json({ result, invocationId: invocation?.id });
}
