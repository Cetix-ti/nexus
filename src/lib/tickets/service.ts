import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { Ticket as UiTicket } from "@/lib/mock-data";

// ----------------------------------------------------------------------------
// Mappers — convert Prisma row (relational) → UI Ticket shape (denormalized).
// This isolates the existing components from the schema rename.
// ----------------------------------------------------------------------------

const includes = {
  organization: true,
  requester: true,
  assignee: true,
  category: true,
  queue: true,
  comments: { orderBy: { createdAt: "asc" as const } },
  activities: { orderBy: { createdAt: "asc" as const } },
  ticketTags: { include: { tag: true } },
};

type PrismaTicket = Prisma.TicketGetPayload<{ include: typeof includes }>;

function statusToUi(s: string): UiTicket["status"] {
  return s.toLowerCase() as UiTicket["status"];
}
function priorityToUi(p: string): any {
  return p.toLowerCase();
}
function typeToUi(t: string): any {
  if (t === "SERVICE_REQUEST") return "request";
  return t.toLowerCase();
}
function sourceToUi(s: string): any {
  return s.toLowerCase();
}

function flatten(t: PrismaTicket): UiTicket {
  return {
    id: t.id,
    number: `INC-${1000 + t.number}`,
    subject: t.subject,
    description: t.description,
    status: statusToUi(t.status),
    priority: priorityToUi(t.priority),
    urgency: priorityToUi(t.urgency),
    impact: priorityToUi(t.impact),
    type: typeToUi(t.type),
    source: sourceToUi(t.source),
    organizationName: t.organization?.name || "—",
    requesterName: t.requester
      ? `${t.requester.firstName} ${t.requester.lastName}`
      : "—",
    requesterEmail: t.requester?.email || "",
    assigneeId: t.assigneeId,
    assigneeName: t.assignee
      ? `${t.assignee.firstName} ${t.assignee.lastName}`
      : null,
    assigneeAvatar: t.assignee?.avatar || null,
    creatorId: t.creatorId,
    categoryName: t.category?.name || "—",
    queueName: t.queue?.name || "—",
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    dueAt: t.dueAt?.toISOString() || null,
    isOverdue: t.isOverdue,
    slaBreached: t.slaBreached,
    tags: t.ticketTags.map((tt) => tt.tag.name),
    comments: t.comments.map((c) => ({
      id: c.id,
      authorName: "—", // Will resolve via author include later
      content: c.body,
      isInternal: c.isInternal,
      createdAt: c.createdAt.toISOString(),
    })),
    activities: t.activities.map((a) => {
      const meta = (a.metadata as any) || {};
      return {
        id: a.id,
        type: a.action as any,
        authorName: meta.authorName || "—",
        content: meta.content || "",
        oldValue: a.oldValue || undefined,
        newValue: a.newValue || undefined,
        createdAt: a.createdAt.toISOString(),
      };
    }),
  };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export async function listTickets(options?: {
  organizationId?: string;
  status?: string;
  search?: string;
}): Promise<UiTicket[]> {
  const where: Prisma.TicketWhereInput = {};
  if (options?.organizationId) where.organizationId = options.organizationId;
  if (options?.status) where.status = options.status as any;
  if (options?.search) {
    where.OR = [
      { subject: { contains: options.search, mode: "insensitive" } },
      { description: { contains: options.search, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.ticket.findMany({
    where,
    include: includes,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map(flatten);
}

export async function getTicket(id: string): Promise<UiTicket | null> {
  const t = await prisma.ticket.findUnique({ where: { id }, include: includes });
  return t ? flatten(t) : null;
}

export async function createTicket(input: {
  organizationId: string;
  subject: string;
  description: string;
  status?: string;
  priority?: string;
  type?: string;
  categoryId?: string | null;
  queueId?: string | null;
  requesterId?: string | null;
  assigneeId?: string | null;
  creatorId: string;
  tags?: string[];
}): Promise<UiTicket> {
  const t = await prisma.ticket.create({
    data: {
      organizationId: input.organizationId,
      subject: input.subject,
      description: input.description,
      status: (input.status?.toUpperCase() || "NEW") as any,
      priority: (input.priority?.toUpperCase() || "MEDIUM") as any,
      type: (input.type?.toUpperCase() || "INCIDENT") as any,
      categoryId: input.categoryId || null,
      queueId: input.queueId || null,
      requesterId: input.requesterId || null,
      assigneeId: input.assigneeId || null,
      creatorId: input.creatorId,
    },
    include: includes,
  });
  return flatten(t);
}

export async function updateTicket(
  id: string,
  patch: Partial<{
    subject: string;
    description: string;
    status: string;
    priority: string;
    assigneeId: string | null;
    categoryId: string | null;
  }>
): Promise<UiTicket> {
  const data: Prisma.TicketUpdateInput = {};
  if (patch.subject !== undefined) data.subject = patch.subject;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.status !== undefined) data.status = patch.status.toUpperCase() as any;
  if (patch.priority !== undefined) data.priority = patch.priority.toUpperCase() as any;
  if (patch.assigneeId !== undefined) {
    data.assignee = patch.assigneeId
      ? { connect: { id: patch.assigneeId } }
      : { disconnect: true };
  }
  if (patch.categoryId !== undefined) {
    data.category = patch.categoryId
      ? { connect: { id: patch.categoryId } }
      : { disconnect: true };
  }
  const t = await prisma.ticket.update({ where: { id }, data, include: includes });
  return flatten(t);
}

export async function deleteTicket(id: string): Promise<void> {
  await prisma.ticket.delete({ where: { id } });
}
