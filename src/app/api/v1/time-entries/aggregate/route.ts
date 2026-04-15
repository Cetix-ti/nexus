import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * GET /api/v1/time-entries/aggregate?ticketIds=id1,id2,...
 *
 * Retourne la somme des minutes loguées par ticket — utilisé par les vues
 * listes (tickets internes, dashboards) pour afficher le temps total sans
 * recharger l'historique complet de chaque ticket.
 *
 * Réponse : { byTicket: Record<ticketId, totalMinutes> }
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ticketIdsStr = searchParams.get("ticketIds");
  if (!ticketIdsStr) {
    return NextResponse.json({ error: "ticketIds requis" }, { status: 400 });
  }
  const ticketIds = ticketIdsStr.split(",").filter(Boolean);
  if (ticketIds.length === 0) {
    return NextResponse.json({ byTicket: {} });
  }

  const rows = await prisma.timeEntry.groupBy({
    by: ["ticketId"],
    where: { ticketId: { in: ticketIds } },
    _sum: { durationMinutes: true },
    _count: { _all: true },
  });

  const byTicket: Record<string, { totalMinutes: number; entries: number }> = {};
  for (const r of rows) {
    byTicket[r.ticketId] = {
      totalMinutes: r._sum.durationMinutes ?? 0,
      entries: r._count._all,
    };
  }
  return NextResponse.json({ byTicket });
}
