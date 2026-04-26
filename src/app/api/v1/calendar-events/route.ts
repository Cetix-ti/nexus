import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getAllowedOrgIds, userCanAccessOrg } from "@/lib/auth/org-scope";
import { stripHtmlToText } from "@/lib/calendar/description-utils";

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
  // Exclut aussi les soft-deleted (events supprimés dans Outlook mais
  // conservés pour préserver les liens ticket/time-entry).
  const baseWhere: Record<string, unknown> = { status: "active", deletedAt: null };
  if (calendarIdsStr) {
    const ids = calendarIdsStr.split(",").filter(Boolean);
    if (ids.length > 0) baseWhere.calendarId = { in: ids };
  }
  // Phase 9 — scope par org. Un event sans organizationId (rencontre
  // interne, déplacement non rattaché) reste visible pour tous ; un
  // event sur une org hors scope est filtré. On ne peut pas mettre OR
  // directement sur baseWhere car finalWhere ajoute déjà un OR (date
  // overlap + recurrence) — on combine via AND.
  const allowedOrgIds = await getAllowedOrgIds(me.id, me.role);
  const orgScopeWhere =
    allowedOrgIds === "all"
      ? null
      : {
          OR: [
            { organizationId: { in: allowedOrgIds } },
            { organizationId: null },
          ],
        };

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
    ...(orgScopeWhere ? { AND: [orgScopeWhere] } : {}),
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
      organization: {
        select: {
          id: true,
          name: true,
          clientCode: true,
          slug: true,
          // `logo` + `isInternal` nécessaires pour l'UI calendrier :
          // - logo : thumbnail des events "company_meeting" (CTX BUREAU)
          //   et avatar secondaire pour les visites chez un client.
          // - isInternal : distingue un "bureau Cetix" d'un "chez client".
          logo: true,
          isInternal: true,
        },
      },
      meeting: { select: { id: true, status: true } },
      internalTicket: { select: { id: true, number: true, subject: true, status: true } },
      internalProject: { select: { id: true, code: true, name: true, status: true } },
      site: { select: { id: true, name: true, city: true } },
      // Multi-agents : pour les WORK_LOCATION "MG/VG MRVL", on a besoin
      // de la liste complète côté UI (avatars groupés, tooltip). Le
      // ownerId reste en back-compat mais n'est plus la source de vérité.
      agents: {
        select: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
      },
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
        // L'enum TicketPriority est déclaré CRITICAL → HIGH → MEDIUM → LOW.
        // ASC trie donc les plus prioritaires en premier (CRITICAL d'abord).
        orderBy: { priority: "asc" },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  // Étend les occurrences récurrentes dans la fenêtre [from, to].
  const expanded = expandRecurrences(raw, fromDate, toDate);

  // Enrichit chaque linkedTicket avec un displayNumber formaté avec le
  // bon préfixe (TK- pour client, INT- pour interne) — évite que le
  // front ait à reconstruire le numéro à partir de raw+isInternal.
  const { getClientTicketPrefix, formatTicketNumber } = await import("@/lib/tenant-settings/service");
  const clientPrefix = await getClientTicketPrefix();
  const enriched = expanded.map((e) => {
    const linked = (e as { linkedTickets?: Array<{ number: number; isInternal: boolean }> }).linkedTickets;
    if (!linked) return e;
    return {
      ...e,
      linkedTickets: linked.map((t) => ({
        ...t,
        displayNumber: formatTicketNumber(t.number, !!t.isInternal, clientPrefix),
      })),
    };
  });

  return NextResponse.json(enriched);
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
  // Phase 9 — refuse de créer un event sur une org hors scope.
  if (body.organizationId && !(await userCanAccessOrg(me.id, me.role, body.organizationId))) {
    return NextResponse.json(
      { error: "Vous n'avez pas accès à cette organisation." },
      { status: 403 },
    );
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
        description: stripHtmlToText(body.description),
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
      // Toutes les descriptions passent par stripHtmlToText pour éviter
      // qu'un client API (ou un formulaire qui enverrait du HTML par
      // erreur) n'injecte des balises qui se retrouveraient affichées
      // telles quelles côté drawer (rendu plain text).
      description: stripHtmlToText(body.description),
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

  // Multi-tickets : body.linkedTicketIds[] — un event peut être lié à
  // N tickets via Ticket.calendarEventId. On set ce FK sur chaque ticket
  // sélectionné. Les tickets anciennement liés et non re-sélectionnés
  // seront traités par le PATCH (ici on est en CREATE donc pas d'unlink).
  const linkedTicketIds: string[] = Array.isArray(body.linkedTicketIds)
    ? body.linkedTicketIds.filter((t: unknown) => typeof t === "string" && !!t)
    : [];
  // Legacy : si seul internalTicketId est fourni, on le traite comme un
  // seul ticket lié (compat back).
  if (linkedTicketIds.length === 0 && body.internalTicketId) {
    linkedTicketIds.push(body.internalTicketId);
  }
  if (linkedTicketIds.length > 0) {
    await prisma.ticket.updateMany({
      where: { id: { in: linkedTicketIds } },
      data: { calendarEventId: created.id },
    });
  }

  // Multi-agents : body.agentIds[] — on remplit la table de jointure.
  // Fallback : si seul ownerId est fourni, on le copie dans agents pour
  // rester cohérent entre single et multi-agent.
  const agentIds: string[] = Array.isArray(body.agentIds) ? body.agentIds : [];
  if (agentIds.length === 0 && body.ownerId) agentIds.push(body.ownerId);
  if (agentIds.length > 0) {
    await prisma.calendarEventAgent.createMany({
      data: agentIds.map((userId: string) => ({ eventId: created.id, userId })),
      skipDuplicates: true,
    });
  }

  // Synchro Outlook pour les WORK_LOCATION : best-effort en arrière-plan.
  if (created.kind === "WORK_LOCATION") {
    import("@/lib/calendar/location-sync")
      .then(({ pushEventToOutlook }) => pushEventToOutlook(created.id))
      .catch((e) => console.warn("[location-sync] push failed:", e));
  }

  return NextResponse.json(created, { status: 201 });
}
