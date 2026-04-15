import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { Ticket as UiTicket, TicketType as UiTicketType } from "@/lib/mock-data";
import { enforceSlaForTicket } from "@/lib/sla/service";
import { runAutomations } from "@/lib/automations/service";

// ----------------------------------------------------------------------------
// Mappers — convert Prisma row (relational) → UI Ticket shape (denormalized).
// This isolates the existing components from the schema rename.
// ----------------------------------------------------------------------------

const detailIncludes = {
  organization: true,
  requester: true,
  assignee: true,
  category: true,
  queue: true,
  comments: {
    include: { author: { select: { firstName: true, lastName: true, avatar: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  activities: {
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  ticketTags: { include: { tag: true } },
  approvals: { orderBy: { createdAt: "asc" as const } },
};

const listIncludes = {
  organization: true,
  requester: true,
  assignee: true,
  category: true,
  queue: true,
  ticketTags: { include: { tag: true } },
  approvals: { orderBy: { createdAt: "asc" as const } },
};

type PrismaTicketDetail = Prisma.TicketGetPayload<{ include: typeof detailIncludes }>;
type PrismaTicketList = Prisma.TicketGetPayload<{ include: typeof listIncludes }>;

// -- Type mapping: DB enum ↔ UI lowercase string --

const TYPE_DB_TO_UI: Record<string, UiTicketType> = {
  INCIDENT: "incident",
  SERVICE_REQUEST: "service_request",
  PROBLEM: "problem",
  CHANGE: "change",
  ALERT: "alert",
};

const TYPE_UI_TO_DB: Record<string, string> = {
  incident: "INCIDENT",
  service_request: "SERVICE_REQUEST",
  request: "SERVICE_REQUEST", // legacy alias
  problem: "PROBLEM",
  change: "CHANGE",
  alert: "ALERT",
};

function statusToUi(s: string): UiTicket["status"] {
  return s.toLowerCase() as UiTicket["status"];
}
function priorityToUi(p: string): any {
  return p.toLowerCase();
}
function typeToUi(t: string): UiTicketType {
  return TYPE_DB_TO_UI[t] ?? (t.toLowerCase() as UiTicketType);
}
function sourceToUi(s: string): any {
  return s.toLowerCase();
}

/** Map a UI type string to DB enum value. */
export function typeToDb(t: string): string {
  const upper = t.toUpperCase();
  // Direct match in DB enum
  if (TYPE_DB_TO_UI[upper]) return upper;
  // UI alias → DB
  const mapped = TYPE_UI_TO_DB[t.toLowerCase()];
  return mapped ?? upper;
}

function flattenDetail(t: PrismaTicketDetail): UiTicket {
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
    organizationId: t.organizationId,
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
      authorName: c.author
        ? `${c.author.firstName} ${c.author.lastName}`
        : "Système",
      authorAvatar: c.author?.avatar ?? undefined,
      content: c.body,
      isInternal: c.isInternal,
      createdAt: c.createdAt.toISOString(),
    })),
    activities: t.activities.map((a) => {
      const meta = (a.metadata as any) || {};
      return {
        id: a.id,
        type: a.action as any,
        authorName: a.user
          ? `${a.user.firstName} ${a.user.lastName}`
          : meta.authorName || "Système",
        content: meta.content || "",
        oldValue: a.oldValue || undefined,
        newValue: a.newValue || undefined,
        createdAt: a.createdAt.toISOString(),
      };
    }),
    projectId: t.projectId ?? undefined,
    approvalStatus: (t.approvalStatus?.toLowerCase() as UiTicket["approvalStatus"]) ?? undefined,
    approvers: (t.approvals ?? []).map((a) => ({
      id: a.id,
      contactId: a.approverId,
      name: a.approverName,
      email: a.approverEmail,
      role: (a.role as "primary" | "secondary") ?? "primary",
      status: (a.status?.toLowerCase() as "pending" | "approved" | "rejected") ?? "pending",
      decidedAt: a.decidedAt?.toISOString(),
      comment: a.comment ?? undefined,
    })),
  };
}

function flattenList(t: PrismaTicketList): UiTicket {
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
    organizationId: t.organizationId,
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
    comments: [],
    activities: [],
    projectId: t.projectId ?? undefined,
    approvalStatus: (t.approvalStatus?.toLowerCase() as UiTicket["approvalStatus"]) ?? undefined,
    approvers: (t.approvals ?? []).map((a) => ({
      id: a.id,
      contactId: a.approverId,
      name: a.approverName,
      email: a.approverEmail,
      role: (a.role as "primary" | "secondary") ?? "primary",
      status: (a.status?.toLowerCase() as "pending" | "approved" | "rejected") ?? "pending",
      decidedAt: a.decidedAt?.toISOString(),
      comment: a.comment ?? undefined,
    })),
  };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export async function listTickets(options?: {
  organizationId?: string;
  status?: string;
  search?: string;
  assigneeId?: string;
  projectId?: string;
  limit?: number;
  /**
   * Par défaut, les tickets de monitoring (source=MONITORING ou type=ALERT)
   * sont EXCLUS des listes tickets classiques — ils vivent dans leur propre
   * dashboard "Alertes monitoring" pour ne pas polluer les vues utilisateur
   * prioritaires (demandes clients, incidents manuels, etc.).
   * `includeMonitoring: true` pour les endpoints qui veulent vraiment tout.
   */
  includeMonitoring?: boolean;
}): Promise<UiTicket[]> {
  const where: Prisma.TicketWhereInput = {};
  if (options?.organizationId) where.organizationId = options.organizationId;
  if (options?.status) where.status = options.status as any;
  if (options?.assigneeId) where.assigneeId = options.assigneeId;
  if (options?.projectId) where.projectId = options.projectId;
  if (options?.search) {
    where.OR = [
      { subject: { contains: options.search, mode: "insensitive" } },
      { description: { contains: options.search, mode: "insensitive" } },
    ];
  }
  // Exclure les tickets monitoring sauf si explicitement demandé.
  if (!options?.includeMonitoring) {
    where.AND = [
      ...((where.AND as Prisma.TicketWhereInput[] | undefined) ?? []),
      { source: { not: "MONITORING" } },
      { type: { not: "ALERT" } },
    ];
  }
  const rows = await prisma.ticket.findMany({
    where,
    include: listIncludes,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
  return rows.map(flattenList);
}

export async function getTicket(id: string): Promise<UiTicket | null> {
  // Support lookup by id or ticket number
  const t = await prisma.ticket.findFirst({
    where: { OR: [{ id }, { number: parseInt(id) || -1 }] },
    include: detailIncludes,
  });
  return t ? flattenDetail(t) : null;
}

export async function createTicket(input: {
  organizationId: string;
  subject: string;
  description: string;
  status?: string;
  priority?: string;
  urgency?: string;
  impact?: string;
  type?: string;
  source?: string;
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
      urgency: (input.urgency?.toUpperCase() || "MEDIUM") as any,
      impact: (input.impact?.toUpperCase() || "MEDIUM") as any,
      type: input.type ? (typeToDb(input.type) as any) : "INCIDENT",
      source: (input.source?.toUpperCase() || "PORTAL") as any,
      categoryId: input.categoryId || null,
      queueId: input.queueId || null,
      requesterId: input.requesterId || null,
      assigneeId: input.assigneeId || null,
      creatorId: input.creatorId,
    },
    include: detailIncludes,
  });

  // Auto-calculate SLA due date for the new ticket
  enforceSlaForTicket(t.id).catch(() => {});

  // Notify the assignee by email (fire-and-forget)
  if (t.assigneeId) {
    import("@/lib/email/ticket-notifications")
      .then((m) => m.notifyTicketCreated(t.id))
      .catch(() => {});
  }

  // Run automation rules (fire-and-forget)
  runAutomations("ticket_created", {
    id: t.id,
    subject: t.subject,
    status: t.status.toLowerCase(),
    priority: t.priority.toLowerCase(),
    type: t.type.toLowerCase(),
    organizationId: t.organizationId,
    organizationName: t.organization?.name,
    assigneeId: t.assigneeId,
    categoryName: t.category?.name,
    source: t.source.toLowerCase(),
    slaBreached: t.slaBreached,
    isOverdue: t.isOverdue,
  }).catch(() => {});

  return flattenDetail(t);
}

export async function updateTicket(
  id: string,
  patch: Partial<{
    subject: string;
    description: string;
    status: string;
    priority: string;
    urgency: string;
    impact: string;
    type: string;
    source: string;
    assigneeId: string | null;
    categoryId: string | null;
    queueId: string | null;
    siteId: string | null;
    requesterId: string | null;
    slaPolicyId: string | null;
    dueAt: string | null;
    isEscalated: boolean;
    projectId: string | null;
  }>,
  userId?: string,
): Promise<UiTicket> {
  const data: Prisma.TicketUpdateInput = {};

  // Track old values for activity log
  let oldTicket: any = null;
  if (patch.status !== undefined || patch.assigneeId !== undefined || patch.priority !== undefined) {
    oldTicket = await prisma.ticket.findUnique({
      where: { id },
      select: { status: true, assigneeId: true, priority: true, assignee: { select: { firstName: true, lastName: true } } },
    });
  }

  if (patch.subject !== undefined) data.subject = patch.subject;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.status !== undefined) data.status = patch.status.toUpperCase() as any;
  if (patch.priority !== undefined) data.priority = patch.priority.toUpperCase() as any;
  if (patch.urgency !== undefined) data.urgency = patch.urgency.toUpperCase() as any;
  if (patch.impact !== undefined) data.impact = patch.impact.toUpperCase() as any;
  if (patch.type !== undefined) data.type = typeToDb(patch.type) as any;
  if (patch.source !== undefined) data.source = patch.source.toUpperCase() as any;
  if (patch.isEscalated !== undefined) data.isEscalated = patch.isEscalated;
  if (patch.dueAt !== undefined) {
    data.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
  }

  // Relations via connect/disconnect
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
  if (patch.queueId !== undefined) {
    data.queue = patch.queueId
      ? { connect: { id: patch.queueId } }
      : { disconnect: true };
  }
  if (patch.siteId !== undefined) {
    data.site = patch.siteId
      ? { connect: { id: patch.siteId } }
      : { disconnect: true };
  }
  if (patch.requesterId !== undefined) {
    data.requester = patch.requesterId
      ? { connect: { id: patch.requesterId } }
      : { disconnect: true };
  }
  if (patch.slaPolicyId !== undefined) {
    data.slaPolicy = patch.slaPolicyId
      ? { connect: { id: patch.slaPolicyId } }
      : { disconnect: true };
  }
  if (patch.projectId !== undefined) {
    data.project = patch.projectId
      ? { connect: { id: patch.projectId } }
      : { disconnect: true };
  }

  // Auto-set resolvedAt/closedAt
  if (patch.status) {
    const upper = patch.status.toUpperCase();
    if (upper === "RESOLVED") data.resolvedAt = new Date();
    if (upper === "CLOSED") data.closedAt = new Date();
  }

  const t = await prisma.ticket.update({ where: { id }, data, include: detailIncludes });

  // Create activity log entries for key changes
  if (oldTicket && userId) {
    const activities: Prisma.ActivityCreateManyInput[] = [];
    if (patch.status !== undefined && oldTicket.status !== patch.status.toUpperCase()) {
      activities.push({
        ticketId: id,
        userId,
        action: "status_change",
        field: "status",
        oldValue: oldTicket.status.toLowerCase(),
        newValue: patch.status.toLowerCase(),
        metadata: { content: "a changé le statut" },
      });
    }
    if (patch.priority !== undefined && oldTicket.priority !== patch.priority.toUpperCase()) {
      activities.push({
        ticketId: id,
        userId,
        action: "priority_change",
        field: "priority",
        oldValue: oldTicket.priority.toLowerCase(),
        newValue: patch.priority.toLowerCase(),
        metadata: { content: "a changé la priorité" },
      });
    }
    if (patch.assigneeId !== undefined && oldTicket.assigneeId !== patch.assigneeId) {
      const newAssignee = patch.assigneeId
        ? await prisma.user.findUnique({ where: { id: patch.assigneeId }, select: { firstName: true, lastName: true } })
        : null;
      activities.push({
        ticketId: id,
        userId,
        action: "assignment",
        field: "assigneeId",
        oldValue: oldTicket.assignee ? `${oldTicket.assignee.firstName} ${oldTicket.assignee.lastName}` : null,
        newValue: newAssignee ? `${newAssignee.firstName} ${newAssignee.lastName}` : null,
        metadata: { content: "a changé l'assignation" },
      });
    }
    if (activities.length > 0) {
      await prisma.activity.createMany({ data: activities });
    }
  }

  return flattenDetail(t);
}

export async function deleteTicket(id: string): Promise<void> {
  await prisma.ticket.delete({ where: { id } });
}
