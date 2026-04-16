// ============================================================================
// GET /api/v1/supervision/dashboard?from=ISO&to=ISO
//
// Retourne les métriques par agent supervisé pour la page /supervision.
// Le user connecté doit être superviseur d'au moins un agent. L'API
// retourne un array d'objets { agent, stats } — un par agent supervisé.
//
// Métriques :
//   - totalMinutes / billableMinutes (heures facturées)
//   - clientMinutes / internalMinutes (ventilation client vs interne)
//   - ticketsWorked (tickets avec saisie de temps dans la période)
//   - ticketsOpenNoTime (assignés ouverts sans aucune saisie)
//   - ticketsTakenInCharge (tickets dont assigneeId = agent, créés dans la période)
//   - ticketsResolved (tickets résolus dans la période)
//   - slaBreachedCount / slaCompliantCount (conformité SLA)
//   - onsiteVisits (déplacements CalendarEvent WORK_LOCATION)
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

import type { TicketStatus } from "@prisma/client";

const ACTIVE_STATUSES: TicketStatus[] = [
  "NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "PENDING",
  "WAITING_CLIENT", "WAITING_VENDOR", "SCHEDULED",
];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const periodStart = from ? new Date(from) : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const periodEnd = to ? new Date(to) : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();

  const supervisions = await prisma.agentSupervision.findMany({
    where: { supervisorId: me.id },
    include: {
      agent: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          role: true,
        },
      },
    },
  });

  if (supervisions.length === 0) {
    return NextResponse.json({ agents: [] });
  }

  const agentIds = supervisions.map((s) => s.agent.id);

  const ticketInclude = {
    organization: { select: { id: true, name: true, clientCode: true } },
    assignee: { select: { id: true, firstName: true, lastName: true } },
    category: { select: { name: true } },
  } as const;

  // TimeEntry n'a pas de @relation explicite vers Ticket dans le schema
  // Prisma — on fait des requêtes séparées et on join en mémoire.
  const [
    timeEntries,
    assignedOpenTickets,
    ticketsResolvedInPeriod,
    ticketsAssignedInPeriod,
    onsiteVisits,
  ] = await Promise.all([
    // 1. Saisies de temps dans la période
    prisma.timeEntry.findMany({
      where: {
        agentId: { in: agentIds },
        startedAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { startedAt: "desc" },
    }),

    // 2. Tickets ouverts assignés
    prisma.ticket.findMany({
      where: {
        assigneeId: { in: agentIds },
        status: { in: ACTIVE_STATUSES },
      },
      include: ticketInclude,
    }),

    // 3. Tickets résolus dans la période
    prisma.ticket.findMany({
      where: {
        assigneeId: { in: agentIds },
        resolvedAt: { gte: periodStart, lte: periodEnd },
      },
      include: ticketInclude,
    }),

    // 4. Tickets pris en charge dans la période
    prisma.ticket.findMany({
      where: {
        assigneeId: { in: agentIds },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      include: ticketInclude,
    }),

    // 5. Déplacements (CalendarEvent WORK_LOCATION)
    prisma.calendarEvent.findMany({
      where: {
        kind: "WORK_LOCATION",
        startsAt: { gte: periodStart, lte: periodEnd },
        agents: { some: { userId: { in: agentIds } } },
      },
      include: {
        agents: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        organization: { select: { id: true, name: true, clientCode: true } },
        linkedTickets: { select: { id: true, number: true, subject: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  // Hydrate les saisies de temps avec les données des tickets (join mémoire).
  const timeEntryTicketIds = [...new Set(timeEntries.map((te) => te.ticketId))];
  const teTickets = timeEntryTicketIds.length > 0
    ? await prisma.ticket.findMany({
        where: { id: { in: timeEntryTicketIds } },
        include: ticketInclude,
      })
    : [];
  const teTicketMap = new Map(teTickets.map((t) => [t.id, t]));

  // Détermine quels tickets ouverts ont eu une saisie dans la période
  const ticketIdsWithTime = new Set(timeEntries.map((te) => te.ticketId));

  // Agrège par agent
  const result = supervisions.map((sup) => {
    const aid = sup.agent.id;

    // Saisies de temps
    const agentEntries = timeEntries.filter((te) => te.agentId === aid);
    const totalMinutes = agentEntries.reduce((s, te) => s + te.durationMinutes, 0);
    const clientEntries = agentEntries.filter((te) => {
      const ticket = teTicketMap.get(te.ticketId);
      return ticket ? !ticket.isInternal : true;
    });
    const internalEntries = agentEntries.filter((te) => {
      const ticket = teTicketMap.get(te.ticketId);
      return ticket ? !!ticket.isInternal : false;
    });
    const clientMinutes = clientEntries.reduce((s, te) => s + te.durationMinutes, 0);
    const internalMinutes = internalEntries.reduce((s, te) => s + te.durationMinutes, 0);

    // Tickets travaillés (avec saisie dans la période)
    const uniqueWorkedIds = [...new Set(agentEntries.map((te) => te.ticketId))];
    const ticketsWorked = uniqueWorkedIds
      .map((tid) => {
        const ticket = teTicketMap.get(tid);
        if (!ticket) return null;
        const minutes = agentEntries
          .filter((x) => x.ticketId === tid)
          .reduce((s, x) => s + x.durationMinutes, 0);
        return {
          id: ticket.id,
          number: ticket.number,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          isInternal: ticket.isInternal,
          organization: ticket.organization,
          minutes,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    // Tickets ouverts sans saisie dans la période
    const openNoTime = assignedOpenTickets
      .filter((t) => t.assigneeId === aid && !ticketIdsWithTime.has(t.id))
      .map((t) => ({
        id: t.id,
        number: t.number,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        isInternal: t.isInternal,
        organization: t.organization,
        createdAt: t.createdAt.toISOString(),
        slaBreached: t.slaBreached,
      }));

    // Tickets résolus
    const resolved = ticketsResolvedInPeriod
      .filter((t) => t.assigneeId === aid)
      .map((t) => ({
        id: t.id,
        number: t.number,
        subject: t.subject,
        organization: t.organization,
        resolvedAt: t.resolvedAt?.toISOString(),
      }));

    // Tickets pris en charge
    const taken = ticketsAssignedInPeriod
      .filter((t) => t.assigneeId === aid)
      .map((t) => ({
        id: t.id,
        number: t.number,
        subject: t.subject,
        organization: t.organization,
        createdAt: t.createdAt.toISOString(),
      }));

    // Déplacements
    const visits = onsiteVisits
      .filter((v) => v.agents.some((a) => a.userId === aid))
      .map((v) => ({
        id: v.id,
        title: v.title,
        location: v.location,
        startsAt: v.startsAt.toISOString(),
        endsAt: v.endsAt.toISOString(),
        organization: v.organization,
        linkedTickets: v.linkedTickets.map((t) => ({
          id: t.id,
          number: t.number,
          subject: t.subject,
        })),
      }));

    // SLA
    const allAssigned = assignedOpenTickets.filter((t) => t.assigneeId === aid);
    const slaBreachedCount = allAssigned.filter((t) => t.slaBreached).length;
    const slaTotal = allAssigned.filter((t) => t.dueAt).length;
    const slaCompliantCount = slaTotal - slaBreachedCount;

    return {
      agent: sup.agent,
      stats: {
        totalMinutes,
        clientMinutes,
        internalMinutes,
        ticketsWorked,
        ticketsOpenNoTime: openNoTime,
        ticketsTakenCount: taken.length,
        ticketsTaken: taken,
        ticketsResolvedCount: resolved.length,
        ticketsResolved: resolved,
        slaBreachedCount,
        slaCompliantCount,
        slaTotal,
        onsiteVisits: visits,
      },
    };
  });

  return NextResponse.json({ agents: result });
}
