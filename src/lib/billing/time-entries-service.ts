import prisma from "@/lib/prisma";

export interface TimeEntryRow {
  id: string;
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
  organizationId: string;
  organizationName: string;
  agentId: string;
  agentName: string;
  timeType: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  description: string;
  isAfterHours: boolean;
  isWeekend: boolean;
  isUrgent: boolean;
  isOnsite: boolean;
  coverageStatus: string;
  coverageReason: string;
  hourlyRate: number | null;
  amount: number | null;
  approvalStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface ListOpts {
  ticketId?: string;
  organizationId?: string;
  agentId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function listTimeEntries(
  opts: ListOpts = {}
): Promise<TimeEntryRow[]> {
  const where: Record<string, unknown> = {};
  if (opts.ticketId) where.ticketId = opts.ticketId;
  if (opts.organizationId) where.organizationId = opts.organizationId;
  if (opts.agentId) where.agentId = opts.agentId;
  if (opts.from || opts.to) {
    const range: Record<string, Date> = {};
    if (opts.from) range.gte = opts.from;
    if (opts.to) range.lte = opts.to;
    where.startedAt = range;
  }

  const rows = await prisma.timeEntry.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: opts.limit ?? 1000,
  });

  if (rows.length === 0) return [];

  // Hydrate org/ticket/agent en lookups groupés (évite N+1).
  const ticketIds = Array.from(new Set(rows.map((r) => r.ticketId)));
  const orgIds = Array.from(new Set(rows.map((r) => r.organizationId)));
  const agentIds = Array.from(new Set(rows.map((r) => r.agentId)));

  const [tickets, orgs, agents] = await Promise.all([
    prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, number: true, subject: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const ticketMap = new Map(tickets.map((t) => [t.id, t]));
  const orgMap = new Map(orgs.map((o) => [o.id, o]));
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticketId,
    ticketNumber: ticketMap.get(r.ticketId)?.number ?? 0,
    ticketSubject: ticketMap.get(r.ticketId)?.subject ?? "—",
    organizationId: r.organizationId,
    organizationName: orgMap.get(r.organizationId)?.name ?? "—",
    agentId: r.agentId,
    agentName: agentMap.get(r.agentId)
      ? `${agentMap.get(r.agentId)!.firstName} ${agentMap.get(r.agentId)!.lastName}`.trim()
      : "—",
    timeType: r.timeType,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    durationMinutes: r.durationMinutes,
    description: r.description,
    isAfterHours: r.isAfterHours,
    isWeekend: r.isWeekend,
    isUrgent: r.isUrgent,
    isOnsite: r.isOnsite,
    coverageStatus: r.coverageStatus,
    coverageReason: r.coverageReason,
    hourlyRate: r.hourlyRate,
    amount: r.amount,
    approvalStatus: r.approvalStatus,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createTimeEntry(input: {
  ticketId: string;
  organizationId: string;
  agentId: string;
  timeType: string;
  startedAt: Date;
  endedAt?: Date | null;
  durationMinutes: number;
  description?: string;
  isAfterHours?: boolean;
  isWeekend?: boolean;
  isUrgent?: boolean;
  isOnsite?: boolean;
  coverageStatus?: string;
  coverageReason?: string;
  hourlyRate?: number | null;
  amount?: number | null;
}) {
  return prisma.timeEntry.create({
    data: {
      ticketId: input.ticketId,
      organizationId: input.organizationId,
      agentId: input.agentId,
      timeType: input.timeType,
      startedAt: input.startedAt,
      endedAt: input.endedAt ?? null,
      durationMinutes: input.durationMinutes,
      description: input.description ?? "",
      isAfterHours: input.isAfterHours ?? false,
      isWeekend: input.isWeekend ?? false,
      isUrgent: input.isUrgent ?? false,
      isOnsite: input.isOnsite ?? false,
      coverageStatus: input.coverageStatus ?? "pending",
      coverageReason: input.coverageReason ?? "",
      hourlyRate: input.hourlyRate ?? null,
      amount: input.amount ?? null,
    },
  });
}

export async function deleteTimeEntry(id: string) {
  return prisma.timeEntry.delete({ where: { id } });
}
