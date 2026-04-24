// ============================================================================
// GET /api/v1/my-space/ticket-suggestions?organizationId=X&date=YYYY-MM-DD
//
// Retourne des tickets pertinents pour lier un déplacement :
//   - Catégorie "mine"       : tickets où MOI (l'agent) j'ai une saisie
//                              de temps ce jour-là pour ce client.
//   - Catégorie "team"       : tickets où un autre agent a une saisie
//                              de temps ce jour-là pour ce client.
//   - Catégorie "recentOpen" : tickets ouverts du client, récents — fallback
//                              si aucun indice temporel.
//
// Utilisé par le modal QuickAddOnsiteTimeModal pour pré-sélectionner et
// mettre en avant les candidats les plus probables.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const organizationId = req.nextUrl.searchParams.get("organizationId");
  const dateStr = req.nextUrl.searchParams.get("date");
  if (!organizationId || !dateStr) {
    return NextResponse.json({ error: "organizationId and date required" }, { status: 400 });
  }

  // Plage locale du jour (00:00 → 23:59:59 local time).
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) {
    return NextResponse.json({ error: "invalid date — expected YYYY-MM-DD" }, { status: 400 });
  }
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);

  // Toutes les saisies de temps pour ce client, ce jour-là.
  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId,
      startedAt: { gte: dayStart, lte: dayEnd },
    },
    select: { ticketId: true, agentId: true, durationMinutes: true },
  });

  // Cumul total de minutes par ticket (toutes saisies confondues) ce jour-là.
  const totalMinutesByTicket = new Map<string, number>();
  for (const e of entries) {
    totalMinutesByTicket.set(
      e.ticketId,
      (totalMinutesByTicket.get(e.ticketId) ?? 0) + (e.durationMinutes ?? 0),
    );
  }

  const mineTicketIds = new Set(
    entries.filter((e) => e.agentId === me.id).map((e) => e.ticketId),
  );
  const teamTicketIds = new Set(
    entries.filter((e) => e.agentId !== me.id).map((e) => e.ticketId),
  );

  // Tickets ouverts du client (borne large, 50 plus récents) — sert
  // de fallback et permet à l'UI de faire une liste complète avec
  // groupe "suggérés" en haut.
  const recentOpen = await prisma.ticket.findMany({
    where: {
      organizationId,
      status: { in: ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "WAITING_CLIENT", "PENDING"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, number: true, subject: true, status: true },
  });

  // Inclut aussi les tickets liés par time entry même s'ils sont fermés,
  // pour que "mine" / "team" ne soient jamais vides par erreur.
  const linkedIds = Array.from(new Set([...mineTicketIds, ...teamTicketIds]));
  const linkedTickets = linkedIds.length > 0
    ? await prisma.ticket.findMany({
        where: { id: { in: linkedIds } },
        select: { id: true, number: true, subject: true, status: true },
      })
    : [];
  const linkedById = new Map(linkedTickets.map((t) => [t.id, t]));

  const mapRow = (t: { id: string; number: number; subject: string | null; status: string }) => ({
    id: t.id,
    number: t.number,
    subject: t.subject ?? "",
    status: t.status,
    totalMinutesToday: totalMinutesByTicket.get(t.id) ?? 0,
  });

  return NextResponse.json({
    mine: Array.from(mineTicketIds).map((id) => linkedById.get(id)).filter(Boolean).map((t) => mapRow(t!)),
    team: Array.from(teamTicketIds).map((id) => linkedById.get(id)).filter(Boolean).map((t) => mapRow(t!)),
    recentOpen: recentOpen.map(mapRow),
  });
}
