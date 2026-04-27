// ============================================================================
// GET /api/v1/intelligence/anomalies
//
// Liste toutes les anomalies requester récentes (7j), enrichies avec les
// tickets concernés pour une investigation rapide. Admin uniquement.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getRecentRequesterAnomalies } from "@/lib/ai/jobs/requester-anomaly";
import prisma from "@/lib/prisma";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET() {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const anomalies = await getRecentRequesterAnomalies(50);
  const allTicketIds = anomalies.flatMap((a) => a.affectedTicketIds ?? []);
  const tickets =
    allTicketIds.length > 0
      ? await prisma.ticket.findMany({
          where: { id: { in: allTicketIds } },
          select: { id: true, number: true, subject: true, createdAt: true },
        })
      : [];
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));

  const enriched = anomalies.map((a) => ({
    ...a,
    affectedTickets: (a.affectedTicketIds ?? [])
      .map((id) => ticketMap.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({
        id: t.id,
        number: t.number,
        subject: t.subject,
        createdAt: t.createdAt.toISOString(),
      })),
  }));

  return NextResponse.json({ anomalies: enriched });
}
