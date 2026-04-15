import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const ticketInclude = {
    organization: { select: { name: true } },
    requester: { select: { firstName: true, lastName: true } },
    assignee: { select: { firstName: true, lastName: true } },
    category: { select: { name: true } },
  } as const;

  // Exclut les tickets auto-générés par la synchro monitoring — ils
  // apparaissent dans "/monitoring" uniquement, jamais dans "Ma journée".
  // Ces tickets ont typiquement creatorId = premier admin (donc Bruno),
  // ce qui les ferait polluer "Créés aujourd'hui" sinon.
  const excludeMonitoring = {
    source: { not: "MONITORING" as const },
    type: { not: "ALERT" as const },
  };

  const [
    createdTickets,
    dueToday,
    scheduledTickets,
    timeEntries,
    // Nouveau : tickets assignés à moi et touchés aujourd'hui
    // (création ou mise à jour) — on filtrera ensuite ceux sans saisie.
    assignedToday,
    // Nouveau : TOUS les onsite du jour (tous agents) pour coordination
    // des déplacements entre techs.
    allOnsiteToday,
  ] = await Promise.all([
    // 1. Tickets I created today (hors monitoring)
    prisma.ticket.findMany({
      where: {
        creatorId: me.id,
        createdAt: { gte: todayStart, lte: todayEnd },
        ...excludeMonitoring,
      },
      include: ticketInclude,
      orderBy: { createdAt: "desc" },
    }),

    // 2. My tickets due today (hors monitoring)
    prisma.ticket.findMany({
      where: {
        assigneeId: me.id,
        dueAt: { gte: todayStart, lte: todayEnd },
        status: {
          notIn: ["CLOSED", "RESOLVED"],
        },
        ...excludeMonitoring,
      },
      include: ticketInclude,
      orderBy: { dueAt: "asc" },
    }),

    // 3. Tickets I planned / scheduled (hors monitoring)
    prisma.ticket.findMany({
      where: {
        assigneeId: me.id,
        status: "SCHEDULED",
        ...excludeMonitoring,
      },
      include: ticketInclude,
      orderBy: { dueAt: "asc" },
    }),

    // 4. All my time entries today (incluent monitoring — un tech peut
    //    légitimement saisir du temps sur un ticket monitoring)
    prisma.timeEntry.findMany({
      where: {
        agentId: me.id,
        startedAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { startedAt: "desc" },
    }),

    // 5. Tickets assignés à moi et actifs aujourd'hui, hors monitoring.
    //    (les alertes monitoring sont gérées dans leur propre dashboard)
    prisma.ticket.findMany({
      where: {
        assigneeId: me.id,
        status: { notIn: ["CLOSED", "RESOLVED", "CANCELLED"] },
        OR: [
          { createdAt: { gte: todayStart, lte: todayEnd } },
          { updatedAt: { gte: todayStart, lte: todayEnd } },
        ],
        ...excludeMonitoring,
      },
      include: ticketInclude,
      orderBy: { updatedAt: "desc" },
    }),

    // 6. Tous les onsite du jour (tous agents). Sert la modale de coordination.
    prisma.timeEntry.findMany({
      where: {
        isOnsite: true,
        startedAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  // ---- Hydrate time entries with ticket info ----
  const teTicketIds = Array.from(
    new Set(timeEntries.map((te) => te.ticketId)),
  );
  const teTickets = teTicketIds.length
    ? await prisma.ticket.findMany({
        where: { id: { in: teTicketIds } },
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          isInternal: true,
          organization: { select: { name: true } },
        },
      })
    : [];
  const ticketMap = new Map(teTickets.map((t) => [t.id, t]));

  // Préfixe client configurable via /settings (tenant-setting
  // tickets.numberingPrefix). Les tickets internes utilisent toujours INT-.
  const { getClientTicketPrefix, formatTicketNumber } = await import("@/lib/tenant-settings/service");
  const clientPrefix = await getClientTicketPrefix();

  function hydrateTimeEntry(te: (typeof timeEntries)[number]) {
    const ticket = ticketMap.get(te.ticketId);
    return {
      id: te.id,
      ticketId: te.ticketId,
      ticketNumber: ticket ? formatTicketNumber(ticket.number, !!ticket.isInternal, clientPrefix) : "—",
      ticketSubject: ticket?.subject ?? "—",
      ticketStatus: ticket?.status?.toLowerCase() ?? "—",
      ticketPriority: ticket?.priority?.toLowerCase() ?? "—",
      organizationName: ticket?.organization?.name ?? "—",
      timeType: te.timeType,
      startedAt: te.startedAt.toISOString(),
      endedAt: te.endedAt?.toISOString() ?? null,
      durationMinutes: te.durationMinutes,
      description: te.description,
      isOnsite: te.isOnsite,
      isAfterHours: te.isAfterHours,
      coverageStatus: te.coverageStatus,
      hourlyRate: te.hourlyRate,
      amount: te.amount,
    };
  }

  const hydratedTimeEntries = timeEntries.map(hydrateTimeEntry);

  // ---- Build "worked-on tickets" (tickets where I logged time today) ----
  // Group time entries per ticket, sum durations
  const workedMap = new Map<
    string,
    { totalMinutes: number; entries: typeof hydratedTimeEntries }
  >();
  for (const te of hydratedTimeEntries) {
    const existing = workedMap.get(te.ticketId);
    if (existing) {
      existing.totalMinutes += te.durationMinutes;
      existing.entries.push(te);
    } else {
      workedMap.set(te.ticketId, {
        totalMinutes: te.durationMinutes,
        entries: [te],
      });
    }
  }
  const workedTickets = Array.from(workedMap.entries()).map(
    ([ticketId, data]) => {
      const first = data.entries[0];
      return {
        ticketId,
        ticketNumber: first.ticketNumber,
        ticketSubject: first.ticketSubject,
        ticketStatus: first.ticketStatus,
        ticketPriority: first.ticketPriority,
        organizationName: first.organizationName,
        totalMinutes: data.totalMinutes,
        entryCount: data.entries.length,
        entries: data.entries,
      };
    },
  );

  // ---- Build onsite/travel entries ----
  const onsiteEntries = hydratedTimeEntries.filter((te) => te.isOnsite);

  // ---- Build "allOnsiteToday" (tous agents, pour la modale de coordination) ----
  // Hydrate les tickets + les agents pour afficher qui a déjà comptabilisé
  // un déplacement chez quel client aujourd'hui.
  const allOnsiteTicketIds = Array.from(
    new Set(allOnsiteToday.map((te) => te.ticketId)),
  );
  const allOnsiteAgentIds = Array.from(
    new Set(allOnsiteToday.map((te) => te.agentId)),
  );
  const [allOnsiteTickets, allOnsiteAgents] = await Promise.all([
    allOnsiteTicketIds.length
      ? prisma.ticket.findMany({
          where: { id: { in: allOnsiteTicketIds } },
          select: {
            id: true,
            number: true,
            subject: true,
            isInternal: true,
            organization: { select: { name: true } },
          },
        })
      : Promise.resolve([] as Array<{
          id: string;
          number: number;
          subject: string;
          isInternal: boolean;
          organization: { name: string } | null;
        }>),
    allOnsiteAgentIds.length
      ? prisma.user.findMany({
          where: { id: { in: allOnsiteAgentIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve(
          [] as Array<{ id: string; firstName: string; lastName: string }>,
        ),
  ]);
  const allOnsiteTicketMap = new Map(allOnsiteTickets.map((t) => [t.id, t]));
  const allOnsiteAgentMap = new Map(allOnsiteAgents.map((a) => [a.id, a]));

  const allOnsiteHydrated = allOnsiteToday.map((te) => {
    const t = allOnsiteTicketMap.get(te.ticketId);
    const a = allOnsiteAgentMap.get(te.agentId);
    return {
      id: te.id,
      agentId: te.agentId,
      agentName: a ? `${a.firstName} ${a.lastName}`.trim() : "—",
      isMine: te.agentId === me.id,
      ticketId: te.ticketId,
      ticketNumber: t ? formatTicketNumber(t.number, !!t.isInternal, clientPrefix) : "—",
      ticketSubject: t?.subject ?? "—",
      organizationName: t?.organization?.name ?? "—",
      durationMinutes: te.durationMinutes,
      startedAt: te.startedAt.toISOString(),
      endedAt: te.endedAt?.toISOString() ?? null,
      description: te.description,
      isAfterHours: te.isAfterHours,
    };
  });

  // ---- Tickets assignés aujourd'hui SANS saisie de temps de ma part ----
  // L'idée : montrer la "todo" du jour — tickets actifs sur lesquels je
  // n'ai pas encore saisi de temps.
  const myWorkedTicketIds = new Set(workedMap.keys());
  const assignedNoTime = assignedToday.filter(
    (t) => !myWorkedTicketIds.has(t.id),
  );

  // ---- Stats ----
  const totalMinutes = timeEntries.reduce(
    (s, te) => s + te.durationMinutes,
    0,
  );
  const billableMinutes = timeEntries
    .filter((te) =>
      [
        "billable",
        "hour_bank_overage",
        "msp_overage",
        "travel_billable",
      ].includes(te.coverageStatus),
    )
    .reduce((s, te) => s + te.durationMinutes, 0);
  const billableAmount = timeEntries
    .filter((te) => te.amount != null && te.amount > 0)
    .reduce((s, te) => s + (te.amount ?? 0), 0);

  // ---- Format ticket helper ----
  function formatTicket(t: (typeof createdTickets)[number]) {
    return {
      id: t.id,
      number: formatTicketNumber(t.number, !!(t as { isInternal?: boolean }).isInternal, clientPrefix),
      subject: t.subject,
      status: t.status.toLowerCase(),
      priority: t.priority.toLowerCase(),
      type: t.type.toLowerCase(),
      organizationName: t.organization?.name ?? "—",
      requesterName: t.requester
        ? `${t.requester.firstName} ${t.requester.lastName}`
        : "—",
      assigneeName: t.assignee
        ? `${t.assignee.firstName} ${t.assignee.lastName}`
        : null,
      categoryName: t.category?.name ?? "—",
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      dueAt: t.dueAt?.toISOString() ?? null,
      slaBreached: t.slaBreached,
    };
  }

  return NextResponse.json({
    date: todayStart.toISOString().split("T")[0],
    stats: {
      totalMinutes,
      billableMinutes,
      billableAmount,
      onsiteCount: onsiteEntries.length,
      ticketsWorked: workedTickets.length,
      ticketsDueToday: dueToday.length,
      ticketsCreated: createdTickets.length,
      ticketsScheduled: scheduledTickets.length,
    },
    workedTickets,
    dueToday: dueToday.map(formatTicket),
    scheduledTickets: scheduledTickets.map(formatTicket),
    createdTickets: createdTickets.map(formatTicket),
    assignedNoTime: assignedNoTime.map(formatTicket),
    allOnsiteToday: allOnsiteHydrated,
    onsiteEntries,
    timeEntries: hydratedTimeEntries,
  });
}
