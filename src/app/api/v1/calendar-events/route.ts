import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * GET /api/v1/calendar-events?from=...&to=...&calendarIds=id1,id2
 * Liste les événements dans une fenêtre temporelle.
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const calendarIdsStr = searchParams.get("calendarIds");

  const where: Record<string, unknown> = { status: "active" };

  if (fromStr || toStr) {
    const fromDate = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = toStr ? new Date(toStr) : new Date(Date.now() + 90 * 24 * 3600 * 1000);
    // Un événement est dans la fenêtre s'il chevauche [from, to] :
    //   startsAt <= to ET endsAt >= from
    where.AND = [
      { startsAt: { lte: toDate } },
      { endsAt: { gte: fromDate } },
    ];
  }

  if (calendarIdsStr) {
    const ids = calendarIdsStr.split(",").filter(Boolean);
    if (ids.length > 0) where.calendarId = { in: ids };
  }

  // Pour les événements récurrents, on charge TOUS les events dont la
  // recurrence pourrait produire une occurrence dans la fenêtre (donc on
  // enlève la borne `endsAt >= from` et on la remplace par une logique
  // "start ≤ to et (recurrence active OU endsAt >= from)")
  const recurrentOr = [
    { recurrence: { in: ["weekly", "monthly", "yearly"] } },
  ];
  const finalWhere = where.AND
    ? ({
        ...where,
        // Conserve les conditions déjà appliquées, mais élargit : un
        // event récurrent peut avoir un startsAt très ancien mais
        // générer des occurrences dans la fenêtre.
        OR: [
          { AND: where.AND as any },
          ...recurrentOr,
        ],
        AND: undefined,
      } as any)
    : where;

  const raw = await prisma.calendarEvent.findMany({
    where: finalWhere,
    include: {
      calendar: { select: { id: true, name: true, kind: true, color: true } },
      owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      organization: { select: { id: true, name: true } },
      meeting: { select: { id: true, status: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  // Étend les occurrences récurrentes dans la fenêtre [from, to].
  const fromDate = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const toDate = toStr ? new Date(toStr) : new Date(Date.now() + 90 * 24 * 3600 * 1000);
  const expanded = expandRecurrences(raw, fromDate, toDate);

  return NextResponse.json(expanded);
}

// ---------------------------------------------------------------------------
// Expand recurring events in a time window. Chaque occurrence générée a un
// id préfixé "`{eventId}@{occurrenceStartISO}`" pour rester unique, et les
// champs startsAt/endsAt décalés sur la bonne date.
// Règles simples : weekly = même jour de semaine, monthly = même jour du
// mois, yearly = même date. On n'implémente pas les RRULE iCal complets
// (BYDAY, INTERVAL>1, etc.) — suffisant pour les cas typiques d'un MSP.
// ---------------------------------------------------------------------------
type EventWithRelations = Awaited<
  ReturnType<typeof prisma.calendarEvent.findMany>
>[number] & {
  calendar?: unknown;
  owner?: unknown;
  organization?: unknown;
  meeting?: unknown;
};

function expandRecurrences(
  events: EventWithRelations[],
  from: Date,
  to: Date,
): EventWithRelations[] {
  const out: EventWithRelations[] = [];
  for (const e of events) {
    if (!e.recurrence) {
      // Non récurrent — inclus seulement si chevauche la fenêtre.
      if (e.startsAt <= to && e.endsAt >= from) out.push(e);
      continue;
    }
    const recEnd = e.recurrenceEndDate ?? to;
    const stopAt = recEnd < to ? recEnd : to;
    const durationMs = e.endsAt.getTime() - e.startsAt.getTime();

    let cursor = new Date(e.startsAt);
    // Safety cap — évite une boucle infinie si les dates sont bizarres.
    let iter = 0;
    while (cursor <= stopAt && iter < 5000) {
      iter++;
      const occStart = new Date(cursor);
      const occEnd = new Date(cursor.getTime() + durationMs);
      if (occEnd >= from && occStart <= to) {
        out.push({
          ...e,
          id: `${e.id}@${occStart.toISOString()}`,
          startsAt: occStart,
          endsAt: occEnd,
        } as EventWithRelations);
      }
      // Avance
      if (e.recurrence === "weekly") {
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 7);
      } else if (e.recurrence === "monthly") {
        cursor = new Date(cursor);
        cursor.setMonth(cursor.getMonth() + 1);
      } else if (e.recurrence === "yearly") {
        cursor = new Date(cursor);
        cursor.setFullYear(cursor.getFullYear() + 1);
      } else {
        break;
      }
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** POST — create an event */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.calendarId || !body.title || !body.startsAt || !body.endsAt) {
    return NextResponse.json(
      { error: "calendarId, title, startsAt, endsAt requis" },
      { status: 400 },
    );
  }

  // Si kind=MEETING et pas de meeting encore, on crée le Meeting en même
  // temps pour que le clic sur l'événement ouvre tout de suite une fiche.
  let meetingId: string | undefined = body.meetingId;
  if (body.kind === "MEETING" && !meetingId) {
    const m = await prisma.meeting.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        location: body.location ?? null,
        createdById: me.id,
        participants: body.participantIds?.length
          ? {
              create: body.participantIds.map((uid: string) => ({
                userId: uid,
                role: uid === me.id ? "organizer" : "attendee",
              })),
            }
          : undefined,
      },
    });
    meetingId = m.id;
  }

  const created = await prisma.calendarEvent.create({
    data: {
      calendarId: body.calendarId,
      title: body.title,
      description: body.description ?? null,
      kind: body.kind ?? "OTHER",
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      allDay: !!body.allDay,
      ownerId: body.ownerId ?? null,
      location: body.location ?? null,
      organizationId: body.organizationId ?? null,
      renewalType: body.renewalType ?? null,
      renewalAmount: body.renewalAmount ?? null,
      renewalNotifyDaysBefore: body.renewalNotifyDaysBefore ?? null,
      renewalExternalRef: body.renewalExternalRef ?? null,
      leaveType: body.leaveType ?? null,
      leaveApproved: body.leaveApproved ?? null,
      recurrence: body.recurrence ?? null,
      recurrenceEndDate: body.recurrenceEndDate ? new Date(body.recurrenceEndDate) : null,
      meetingId: meetingId ?? null,
      internalTicketId: body.internalTicketId ?? null,
      internalProjectId: body.internalProjectId ?? null,
      createdById: me.id,
    },
    include: {
      calendar: { select: { id: true, name: true, kind: true, color: true } },
      owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      meeting: { select: { id: true } },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
