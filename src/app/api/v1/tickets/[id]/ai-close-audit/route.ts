// ============================================================================
// POST /api/v1/tickets/[id]/ai-close-audit
//
// Audit IA avant fermeture : évalue la complétude de la documentation +
// propose des suivis préventifs. Ne modifie PAS le ticket. L'agent peut
// fermer quand même — c'est un nudge, pas un gate.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { auditTicketForClose } from "@/lib/ai/features/close-audit";

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

  const result = await auditTicketForClose(id);
  if (!result) {
    return NextResponse.json(
      { error: "Audit impossible — voir logs serveur." },
      { status: 502 },
    );
  }

  const invocation = await prisma.aiInvocation.findFirst({
    where: { ticketId: id, feature: "close_audit" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return NextResponse.json({ result, invocationId: invocation?.id });
}
