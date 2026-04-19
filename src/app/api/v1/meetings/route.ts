import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { ensureNexusCalendar } from "@/lib/calendar/location-sync";
import { notifyMeetingInvite } from "@/lib/calendar/meeting-reminders";

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

/**
 * POST /api/v1/meetings
 *
 * Crée une rencontre depuis la page liste (menu latéral → Rencontres). Crée
 * aussi son CalendarEvent dans le calendrier « Localisation » — c'est la
 * source unique des activités de l'équipe, donc chaque rencontre y apparaît
 * automatiquement pour que l'agenda global reste à jour.
 *
 * Body : {
 *   title, description?, location?,
 *   startsAt, endsAt (ISO),
 *   participantIds?: string[],      // agents à ajouter (rôle "attendee")
 *   agenda?: Array<{ title, description?, durationMinutes? }>,
 * }
 *
 * Effets de bord :
 *   - Le créateur est auto-ajouté comme "organizer"
 *   - Les participants reçoivent une notification in-app + email
 *     (via notifyMeetingInvite).
 *   - Un CalendarEvent kind=MEETING est créé dans « Localisation »,
 *     lié au meeting par meetingId.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title requis" }, { status: 400 });
  }
  if (!body.startsAt || !body.endsAt) {
    return NextResponse.json(
      { error: "startsAt et endsAt requis" },
      { status: 400 },
    );
  }
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: "Dates invalides" }, { status: 400 });
  }
  if (endsAt <= startsAt) {
    return NextResponse.json(
      { error: "La fin doit être après le début" },
      { status: 400 },
    );
  }

  const participantIds: string[] = Array.isArray(body.participantIds)
    ? body.participantIds.filter(
        (u: unknown) => typeof u === "string" && u && u !== me.id,
      )
    : [];

  const description =
    typeof body.description === "string" ? body.description : null;
  const location = typeof body.location === "string" ? body.location : null;

  type AgendaInput = {
    title: string;
    description?: string | null;
    durationMinutes?: number | null;
  };
  const rawAgenda: unknown[] = Array.isArray(body.agenda) ? body.agenda : [];
  const agendaInput: AgendaInput[] = rawAgenda
    .filter(
      (a): a is { title: string; description?: unknown; durationMinutes?: unknown } =>
        !!a &&
        typeof a === "object" &&
        typeof (a as { title?: unknown }).title === "string" &&
        (a as { title: string }).title.trim().length > 0,
    )
    .map((a) => ({
      title: a.title.trim(),
      description: typeof a.description === "string" ? a.description : null,
      durationMinutes:
        typeof a.durationMinutes === "number" ? a.durationMinutes : null,
    }));

  const meeting = await prisma.meeting.create({
    data: {
      title,
      description,
      location,
      startsAt,
      endsAt,
      createdById: me.id,
      participants: {
        create: [
          { userId: me.id, role: "organizer" },
          ...participantIds.map((uid) => ({
            userId: uid,
            role: "attendee" as const,
          })),
        ],
      },
      agenda:
        agendaInput.length > 0
          ? {
              create: agendaInput.map((a, idx) => ({
                title: a.title,
                description: a.description ?? null,
                durationMinutes: a.durationMinutes ?? null,
                order: idx,
                addedById: me.id,
              })),
            }
          : undefined,
    },
    select: { id: true },
  });

  // Calendrier « Localisation » — source unique des activités de l'équipe
  // (crée le calendrier si absent). Best-effort : si ça échoue, on garde la
  // rencontre mais elle n'apparaît pas dans le calendrier global — on log.
  try {
    const calendarId = await ensureNexusCalendar();
    await prisma.calendarEvent.create({
      data: {
        calendarId,
        title,
        description,
        kind: "MEETING",
        startsAt,
        endsAt,
        location,
        meetingId: meeting.id,
        createdById: me.id,
      },
    });
  } catch (err) {
    console.warn("[meetings POST] création calendarEvent échouée:", err);
  }

  // Notifications aux agents invités (best-effort, pas bloquant)
  if (participantIds.length > 0) {
    try {
      await notifyMeetingInvite(meeting.id, participantIds, me.id);
    } catch (err) {
      console.warn("[meetings POST] notifications échouées:", err);
    }
  }

  return NextResponse.json({ id: meeting.id }, { status: 201 });
}
