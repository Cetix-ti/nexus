import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * GET /api/v1/meetings
 *  ?status=scheduled,in_progress,completed,cancelled
 *  ?from=ISO  ?to=ISO     (filtre par startsAt dans la fenêtre)
 *  ?mine=true             (que les rencontres où je suis créateur ou participant)
 *  ?search=...            (substring sur le titre, case-insensitive)
 *  ?limit=N               (défaut 100)
 *
 * Retourne un tableau plat de réunions avec :
 *  - createdBy { firstName, lastName }
 *  - participantCount, generatedTicketCount, agendaCount
 *  - 1ers participants (3 max) pour affichage
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const mine = searchParams.get("mine") === "true";
  const search = searchParams.get("search");
  const limitStr = searchParams.get("limit");
  const limit = limitStr ? Math.min(500, Math.max(1, parseInt(limitStr, 10))) : 100;

  const where: Record<string, unknown> = {};
  if (statusParam) {
    const list = statusParam.split(",").filter(Boolean);
    if (list.length > 0) where.status = { in: list };
  }
  if (fromStr || toStr) {
    const range: Record<string, Date> = {};
    if (fromStr) {
      const f = new Date(fromStr);
      if (!Number.isNaN(f.getTime())) range.gte = f;
    }
    if (toStr) {
      const t = new Date(toStr);
      if (!Number.isNaN(t.getTime())) range.lte = t;
    }
    where.startsAt = range;
  }
  if (mine) {
    where.OR = [
      { createdById: me.id },
      { participants: { some: { userId: me.id } } },
    ];
  }
  if (search) {
    const sub = { contains: search, mode: "insensitive" as const };
    const orClauses = [{ title: sub }, { description: sub }];
    if (where.OR) {
      // Combine "mine" + search en AND { OR: mine } { OR: search }
      const existing = where.OR;
      delete where.OR;
      where.AND = [{ OR: existing }, { OR: orClauses }];
    } else {
      where.OR = orClauses;
    }
  }

  const meetings = await prisma.meeting.findMany({
    where: where as never,
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      participants: {
        take: 3,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
      },
      _count: {
        select: { participants: true, generatedTickets: true, agenda: true },
      },
    },
    orderBy: { startsAt: "desc" },
    take: limit,
  });

  return NextResponse.json(
    meetings.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      status: m.status,
      location: m.location,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
      createdBy: m.createdBy
        ? {
            id: m.createdBy.id,
            name: `${m.createdBy.firstName} ${m.createdBy.lastName}`,
            avatar: m.createdBy.avatar,
          }
        : null,
      participantCount: m._count.participants,
      generatedTicketCount: m._count.generatedTickets,
      agendaCount: m._count.agenda,
      participantsPreview: m.participants.map((p) => ({
        id: p.user.id,
        name: `${p.user.firstName} ${p.user.lastName}`,
        avatar: p.user.avatar,
      })),
    })),
  );
}
