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

  const events = await prisma.calendarEvent.findMany({
    where,
    include: {
      calendar: { select: { id: true, name: true, kind: true, color: true } },
      owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      organization: { select: { id: true, name: true } },
      meeting: { select: { id: true, status: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  return NextResponse.json(events);
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
