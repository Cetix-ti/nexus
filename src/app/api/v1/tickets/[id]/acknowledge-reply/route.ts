// ============================================================================
// POST /api/v1/tickets/[id]/acknowledge-reply
//
// Marque la dernière réponse client comme "vue" par l'agent (= retire le
// ticket de la section Kanban "Réponses reçues" sans avoir besoin de
// commenter). Set ticket.lastClientReplyAcknowledgedAt = now.
//
// Auth : agents staff seulement.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const updated = await prisma.ticket
    .update({
      where: { id },
      data: { lastClientReplyAcknowledgedAt: new Date() },
      select: { id: true, lastClientReplyAcknowledgedAt: true },
    })
    .catch(() => null);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
