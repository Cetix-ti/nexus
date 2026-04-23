// Détecte les déplacements déjà facturés pour une organisation à une date
// donnée — utilisé par la modale de saisie de temps pour afficher un
// avertissement et éviter la double facturation d'un déplacement.
//
// GET /api/v1/time-entries/travel-conflicts?orgId=X&date=YYYY-MM-DD[&excludeId=Z]
//
// TimeEntry n'a pas de relations Prisma définies (ticketId/agentId sont de
// simples FK string) — on joint manuellement.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const dateStr = searchParams.get("date"); // YYYY-MM-DD
  const excludeId = searchParams.get("excludeId");

  if (!orgId || !dateStr) {
    return NextResponse.json({ error: "orgId et date requis (date au format YYYY-MM-DD)" }, { status: 400 });
  }

  const dayStart = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(dayStart.getTime())) {
    return NextResponse.json({ error: "date invalide" }, { status: 400 });
  }
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId: orgId,
      hasTravelBilled: true,
      startedAt: { gte: dayStart, lt: dayEnd },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      ticketId: true,
      agentId: true,
      startedAt: true,
      durationMinutes: true,
    },
    orderBy: { startedAt: "asc" },
  });

  if (entries.length === 0) {
    return NextResponse.json({ date: dateStr, organizationId: orgId, conflicts: [] });
  }

  const ticketIds = Array.from(new Set(entries.map((e) => e.ticketId)));
  const agentIds = Array.from(new Set(entries.map((e) => e.agentId)));

  const [tickets, agents] = await Promise.all([
    prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, number: true, subject: true },
    }),
    prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return NextResponse.json({
    date: dateStr,
    organizationId: orgId,
    conflicts: entries.map((e) => {
      const t = ticketMap.get(e.ticketId);
      const a = agentMap.get(e.agentId);
      return {
        id: e.id,
        ticketId: e.ticketId,
        ticketNumber: t?.number ?? null,
        ticketSubject: t?.subject ?? null,
        agentId: e.agentId,
        agentName: a ? `${a.firstName} ${a.lastName}`.trim() : null,
        startedAt: e.startedAt.toISOString(),
        durationMinutes: e.durationMinutes,
      };
    }),
  });
}
