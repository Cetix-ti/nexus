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

  const [createdTickets, dueToday, scheduledTickets, timeEntries] =
    await Promise.all([
      // 1. Tickets I created today
      prisma.ticket.findMany({
        where: {
          creatorId: me.id,
          createdAt: { gte: todayStart, lte: todayEnd },
        },
        include: ticketInclude,
        orderBy: { createdAt: "desc" },
      }),

      // 2. My tickets due today
      prisma.ticket.findMany({
        where: {
          assigneeId: me.id,
          dueAt: { gte: todayStart, lte: todayEnd },
          status: {
            notIn: ["CLOSED", "RESOLVED"],
          },
        },
        include: ticketInclude,
        orderBy: { dueAt: "asc" },
      }),

      // 3. Tickets I planned / scheduled
      prisma.ticket.findMany({
        where: {
          assigneeId: me.id,
          status: "SCHEDULED",
        },
        include: ticketInclude,
        orderBy: { dueAt: "asc" },
      }),

      // 4. All my time entries today
      prisma.timeEntry.findMany({
        where: {
          agentId: me.id,
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
          organization: { select: { name: true } },
        },
      })
    : [];
  const ticketMap = new Map(teTickets.map((t) => [t.id, t]));

  function hydrateTimeEntry(te: (typeof timeEntries)[number]) {
    const ticket = ticketMap.get(te.ticketId);
    return {
      id: te.id,
      ticketId: te.ticketId,
      ticketNumber: ticket ? `INC-${1000 + ticket.number}` : "—",
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
      number: `INC-${1000 + t.number}`,
      subject: t.subject,
      status: t.status.toLowerCase(),
      priority: t.priority.toLowerCase(),
      type: t.type === "SERVICE_REQUEST" ? "request" : t.type.toLowerCase(),
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
    onsiteEntries,
    timeEntries: hydratedTimeEntries,
  });
}
