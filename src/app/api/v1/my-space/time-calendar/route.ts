// GET /api/v1/my-space/time-calendar?from=ISO&to=ISO
//
// Retourne toutes les saisies de temps du user connecté dans la plage,
// avec les infos ticket + organisation nécessaires à la vue calendrier.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const periodStart = from ? new Date(from) : (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  })();
  const periodEnd = to ? new Date(to) : (() => {
    const d = new Date(); d.setHours(23, 59, 59, 999); return d;
  })();

  const entries = await prisma.timeEntry.findMany({
    where: {
      agentId: me.id,
      startedAt: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { startedAt: "asc" },
    take: 2000,
  });

  if (entries.length === 0) return NextResponse.json({ entries: [] });

  const ticketIds = [...new Set(entries.map((e) => e.ticketId))];
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: {
      id: true,
      number: true,
      subject: true,
      isInternal: true,
      organization: {
        select: { id: true, name: true, clientCode: true, logo: true },
      },
    },
  });
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));

  const result = entries.map((e) => {
    const ticket = ticketMap.get(e.ticketId);
    return {
      id: e.id,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt?.toISOString() ?? null,
      durationMinutes: e.durationMinutes,
      description: e.description,
      timeType: e.timeType,
      coverageStatus: e.coverageStatus,
      isOnsite: e.isOnsite,
      ticketId: e.ticketId,
      ticketNumber: ticket?.number ?? 0,
      ticketSubject: ticket?.subject ?? "—",
      isInternal: ticket?.isInternal ?? false,
      organization: ticket?.organization ?? null,
    };
  });

  return NextResponse.json({ entries: result });
}
