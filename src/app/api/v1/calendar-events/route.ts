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

  const fromDate = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const toDate = toStr ? new Date(toStr) : new Date(Date.now() + 90 * 24 * 3600 * 1000);

  // Contraintes communes (status + calendarIds) qui s'appliquent à TOUS
  // les events, qu'ils soient récurrents ou non.
  const baseWhere: Record<string, unknown> = { status: "active" };
  if (calendarIdsStr) {
    const ids = calendarIdsStr.split(",").filter(Boolean);
    if (ids.length > 0) baseWhere.calendarId = { in: ids };
  }

  // Deux cas d'inclusion :
  //   (a) event classique qui chevauche la fenêtre
  //       → startsAt <= to ET endsAt >= from
  //   (b) event récurrent : on l'inclut même si son startsAt d'origine
  //       est avant la fenêtre (l'expansion ci-dessous générera les
  //       occurrences dans la fenêtre).
  //       → startsAt <= to ET (recurrence != null)
  // On combine via OR tout en gardant les contraintes de base (status,
  // calendarIds) sur chaque branche.
  const finalWhere = {
    ...baseWhere,
    OR: [
      { AND: [{ startsAt: { lte: toDate } }, { endsAt: { gte: fromDate } }] },
      {
        AND: [
          { startsAt: { lte: toDate } },
          { recurrence: { in: ["weekly", "monthly", "yearly"] } },
        ],
      },
    ],
  };

  const raw = await prisma.calendarEvent.findMany({
    where: finalWhere as never,
    include: {
      calendar: { select: { id: true, name: true, kind: true, color: true } },
      owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      organization: { select: { id: true, name: true, clientCode: true, slug: true } },
      meeting: { select: { id: true, status: true } },
      internalTicket: { select: { id: true, number: true, subject: true, status: true } },
      internalProject: { select: { id: true, code: true, name: true, status: true } },
      site: { select: { id: true, name: true, city: true } },
      linkedTickets: {
        // Filtre display-time : un ticket qui n'est plus "requiresOnSite"
        // OU qui est résolu/fermé/annulé disparait de la liste planifiée
        // sans qu'on ait à toucher la DB. Si l'utilisateur ré-active le
        // flag, le ticket revient automatiquement.
        where: {
          requiresOnSite: true,
          status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
        },
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          isInternal: true,
          organizationId: true,
          assigneeId: true,
          assignee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { priority: "desc" },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  // Étend les occurrences récurrentes dans la fenêtre [from, to].
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
  if (
    !body.calendarId ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    !body.startsAt ||
    !body.endsAt
  ) {
    return NextResponse.json(
      { error: "calendarId, title, startsAt, endsAt requis" },
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
  if (body.recurrenceEndDate) {
    const recEnd = new Date(body.recurrenceEndDate);
    if (Number.isNaN(recEnd.getTime()) || recEnd < endsAt) {
      return NextResponse.json(
        { error: "La fin de récurrence doit être après la fin de l'événement" },
        { status: 400 },
      );
    }
  }

  // Si kind=MEETING et pas de meeting encore, on crée le Meeting en même
  // temps pour que le clic sur l'événement ouvre tout de suite une fiche.
  let meetingId: string | undefined = body.meetingId;
  if (body.kind === "MEETING" && !meetingId) {
    const m = await prisma.meeting.create({
      data: {
        title: body.title.trim(),
        description: body.description ?? null,
        startsAt,
        endsAt,
        location: body.location ?? null,
        createdById: me.id,
        participants: {
          create: [
            // Créateur auto-ajouté comme organisateur
            { userId: me.id, role: "organizer" },
            ...(Array.isArray(body.participantIds)
              ? body.participantIds
                  .filter((uid: string) => uid && uid !== me.id)
                  .map((uid: string) => ({
                    userId: uid,
                    role: "attendee" as const,
                  }))
              : []),
          ],
        },
      },
    });
    meetingId = m.id;
    // Notifie les participants qu'ils ont été invités (best-effort).
    const inviteeIds = Array.isArray(body.participantIds)
      ? body.participantIds.filter((uid: string) => uid && uid !== me.id)
      : [];
    if (inviteeIds.length > 0) {
      try {
        const { notifyMeetingInvite } = await import("@/lib/calendar/meeting-reminders");
        await notifyMeetingInvite(m.id, inviteeIds, me.id);
      } catch (e) {
        console.warn("[meeting-invite] notification failed:", e);
      }
    }
  }

  const created = await prisma.calendarEvent.create({
    data: {
      calendarId: body.calendarId,
      title: body.title.trim(),
      description: body.description ?? null,
      kind: body.kind ?? "OTHER",
      startsAt,
      endsAt,
      allDay: !!body.allDay,
      ownerId: body.ownerId ?? null,
      location: body.location ?? null,
      organizationId: body.organizationId ?? null,
      siteId: body.siteId ?? null,
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
