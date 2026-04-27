// ============================================================================
// GET /api/v1/intelligence/kb-gaps
//
// Liste priorisée des catégories où la KB manque d'articles couvrant les cas
// où l'IA se plante régulièrement. Enrichi avec les sujets des tickets échantillons
// pour que le rédacteur ait du contexte direct.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getTopKbGaps } from "@/lib/ai/jobs/kb-gaps-detector";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET() {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const gaps = await getTopKbGaps(30);
  const allTicketIds = gaps.flatMap((g) => g.sampleTicketIds ?? []);
  const tickets =
    allTicketIds.length > 0
      ? await prisma.ticket.findMany({
          where: { id: { in: allTicketIds } },
          select: {
            id: true,
            number: true,
            subject: true,
          },
        })
      : [];
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  const enriched = gaps.map((g) => ({
    ...g,
    sampleTickets: (g.sampleTicketIds ?? [])
      .map((id) => ticketById.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t),
  }));

  return NextResponse.json({ gaps: enriched });
}
