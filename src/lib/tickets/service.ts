import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { Ticket as UiTicket, TicketType as UiTicketType } from "@/lib/mock-data";
import { enforceSlaForTicket } from "@/lib/sla/service";
import { runAutomations } from "@/lib/automations/service";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";

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

function flattenDetail(t: PrismaTicketDetail, clientPrefix: string): UiTicket {
  return {
    id: t.id,
    number: formatTicketNumber(t.number, !!t.isInternal, clientPrefix),
    // Préserve le HTML d'origine (courriels entrants) pour affichage
    // fidèle dans la fiche ticket et le portail client.
    descriptionHtml: t.descriptionHtml ?? undefined,
    subject: t.subject,
    description: t.description,
    status: statusToUi(t.status),
    priority: priorityToUi(t.priority),
    prioritySource: (t.prioritySource as UiTicket["prioritySource"]) ?? null,
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
      contentHtml: c.bodyHtml ?? undefined,
      source: (c as { source?: string | null }).source ?? undefined,
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
    isInternal: t.isInternal ?? false,
    requiresOnSite: t.requiresOnSite ?? false,
    calendarEventId: t.calendarEventId ?? null,
    meetingId: t.meetingId ?? undefined,
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

function flattenList(t: PrismaTicketList, clientPrefix: string): UiTicket {
  return {
    id: t.id,
    number: formatTicketNumber(t.number, !!t.isInternal, clientPrefix),
    subject: t.subject,
    description: t.description,
    status: statusToUi(t.status),
    priority: priorityToUi(t.priority),
    prioritySource: (t.prioritySource as UiTicket["prioritySource"]) ?? null,
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
    isInternal: t.isInternal ?? false,
    requiresOnSite: t.requiresOnSite ?? false,
    calendarEventId: t.calendarEventId ?? null,
    meetingId: t.meetingId ?? undefined,
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
  /**
   * Filtre interne/client. Par défaut (undefined) = que des tickets
   * clients (isInternal=false). `true` = seulement internes, `"all"` =
   * tout.
   */
  internal?: boolean | "all";
  /**
   * Filtre corbeille :
   *   - undefined (défaut) : exclut les tickets DELETED des vues
   *   - "only" : RETOURNE uniquement les tickets DELETED (vue corbeille)
   *   - "include" : les inclut dans la recherche normale (recherche
   *     globale par sujet/numéro pour retrouver un ticket supprimé)
   */
  trash?: "only" | "include";
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
  // Filtre isInternal : par défaut cache les internes dans les vues client.
  if (options?.internal !== "all") {
    where.isInternal = options?.internal === true;
  }
  // Exclure les tickets monitoring sauf si explicitement demandé.
  if (!options?.includeMonitoring) {
    where.AND = [
      ...((where.AND as Prisma.TicketWhereInput[] | undefined) ?? []),
      { source: { not: "MONITORING" } },
      { type: { not: "ALERT" } },
    ];
  }
  // Corbeille : par défaut on exclut les DELETED. "only" = que la
  // corbeille. "include" = tout (utile pour les recherches globales
  // pour retrouver un ticket supprimé par erreur).
  if (options?.trash === "only") {
    where.status = "DELETED" as any;
  } else if (options?.trash !== "include") {
    where.AND = [
      ...((where.AND as Prisma.TicketWhereInput[] | undefined) ?? []),
      { status: { not: "DELETED" } },
    ];
  }
  const rows = await prisma.ticket.findMany({
    where,
    include: listIncludes,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
  const clientPrefix = await getClientTicketPrefix();
  return rows.map((t) => flattenList(t, clientPrefix));
}

export async function getTicket(id: string): Promise<UiTicket | null> {
  // Support lookup by id or ticket number
  const t = await prisma.ticket.findFirst({
    where: { OR: [{ id }, { number: parseInt(id) || -1 }] },
    include: detailIncludes,
  });
  if (!t) return null;
  const clientPrefix = await getClientTicketPrefix();
  return flattenDetail(t, clientPrefix);
}

export async function createTicket(input: {
  organizationId: string;
  subject: string;
  /** Texte plain — fallback pour la recherche et les vues sans HTML. */
  description: string;
  /** HTML riche (TipTap, email entrant) — source de vérité pour l'affichage. */
  descriptionHtml?: string | null;
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
  isInternal?: boolean;
  meetingId?: string | null;
}): Promise<UiTicket> {
  // Priorité : par défaut LOW. Si le créateur a fourni une valeur
  // EXPLICITE (medium/high/critical/low), on la garde telle quelle et on
  // marque prioritySource="MANUAL" pour que l'auto-prioritisation IA sache
  // qu'un humain s'est prononcé. Sinon prioritySource="DEFAULT" et l'IA
  // pourra remonter la priorité si elle détecte un signal fort.
  const priorityDb = (input.priority?.toUpperCase() || "LOW") as
    | "CRITICAL"
    | "HIGH"
    | "MEDIUM"
    | "LOW";
  const priorityWasExplicit = !!input.priority;

  const t = await prisma.ticket.create({
    data: {
      organizationId: input.organizationId,
      subject: input.subject,
      description: input.description,
      descriptionHtml: input.descriptionHtml ?? null,
      status: (input.status?.toUpperCase() || "NEW") as any,
      priority: priorityDb as any,
      prioritySource: priorityWasExplicit ? "MANUAL" : "DEFAULT",
      urgency: (input.urgency?.toUpperCase() || "MEDIUM") as any,
      impact: (input.impact?.toUpperCase() || "MEDIUM") as any,
      type: input.type ? (typeToDb(input.type) as any) : "INCIDENT",
      source: (input.source?.toUpperCase() || "PORTAL") as any,
      categoryId: input.categoryId || null,
      queueId: input.queueId || null,
      requesterId: input.requesterId || null,
      assigneeId: input.assigneeId || null,
      creatorId: input.creatorId,
      isInternal: input.isInternal ?? false,
      meetingId: input.meetingId ?? null,
    },
    include: detailIncludes,
  });

  // Auto-calculate SLA due date for the new ticket
  enforceSlaForTicket(t.id).catch(() => {});

  // Auto-catégorisation IA (fire-and-forget) — si aucun categoryId
  // n'a été fourni ET qu'on a un subject. Seuls les tickets non
  // classés sont concernés : si le créateur a pris la peine de choisir
  // une catégorie, on respecte son choix. Idempotent : le helper
  // revérifie categoryId avant d'écrire pour éviter les races.
  if (!t.categoryId && t.subject?.trim()) {
    import("@/lib/ai/auto-categorize")
      .then((m) => m.autoCategorizeTicketAsync(t.id))
      .catch(() => {});
  }

  // Auto-prioritisation IA (fire-and-forget). Contrairement à la catégorie,
  // on lance TOUJOURS l'analyse — même si le créateur a fourni une priorité
  // explicite. L'IA n'écrit que si sa confiance est "high" (voir
  // src/lib/ai/auto-prioritize.ts). La notice "Priorité définie par l'IA"
  // côté UI est déclenchée par prioritySource="AI".
  if (t.subject?.trim()) {
    import("@/lib/ai/auto-prioritize")
      .then((m) => m.autoPrioritizeTicketAsync(t.id))
      .catch(() => {});
  }

  // Notifications (fire-and-forget) : agents (in-app + email) et contact
  // demandeur (courriel de confirmation, gated par l'allowlist en dev).
  // Si aucun assignee → tous les agents actifs reçoivent "à prendre en
  // charge". Voir `src/lib/notifications/dispatch.ts`.
  import("@/lib/notifications/dispatch")
    .then((m) => m.dispatchTicketCreatedNotifications(t.id))
    .catch(() => {});

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

  const clientPrefix = await getClientTicketPrefix();
  return flattenDetail(t, clientPrefix);
}

export async function updateTicket(
  id: string,
  patch: Partial<{
    subject: string;
    description: string;
    descriptionHtml: string | null;
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
    requiresOnSite: boolean;
    calendarEventId: string | null;
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
  if (patch.descriptionHtml !== undefined) data.descriptionHtml = patch.descriptionHtml;
  if (patch.status !== undefined) data.status = patch.status.toUpperCase() as any;
  // Tout changement explicite de priorité via updateTicket vient d'un agent
  // (édition UI ou API). On marque prioritySource="MANUAL" pour figer la
  // valeur : l'auto-prioritisation IA ne la touchera plus et la notice
  // "Priorité définie par l'IA" disparaîtra de la fiche.
  if (patch.priority !== undefined) {
    data.priority = patch.priority.toUpperCase() as any;
    data.prioritySource = "MANUAL";
  }
  if (patch.urgency !== undefined) data.urgency = patch.urgency.toUpperCase() as any;
  if (patch.impact !== undefined) data.impact = patch.impact.toUpperCase() as any;
  if (patch.type !== undefined) data.type = typeToDb(patch.type) as any;
  if (patch.source !== undefined) data.source = patch.source.toUpperCase() as any;
  if (patch.isEscalated !== undefined) data.isEscalated = patch.isEscalated;
  if (patch.requiresOnSite !== undefined) data.requiresOnSite = patch.requiresOnSite;
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
  if (patch.calendarEventId !== undefined) {
    data.calendarEvent = patch.calendarEventId
      ? { connect: { id: patch.calendarEventId } }
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

  const clientPrefix = await getClientTicketPrefix();
  return flattenDetail(t, clientPrefix);
}

/**
 * Soft-delete : le ticket passe en status=DELETED mais reste en DB.
 * La DELETE cascade native (activités, commentaires, attachements)
 * est évitée pour permettre la restauration intégrale. L'admin peut
 * trouver le ticket via recherche (trash:"include") ou la corbeille
 * dédiée (trash:"only").
 *
 * Idempotent : supprimer un ticket déjà supprimé ne change rien.
 */
export async function deleteTicket(id: string): Promise<void> {
  await prisma.ticket.update({
    where: { id },
    data: { status: "DELETED" as any },
  });
}

/**
 * Soft-delete en lot. Retourne le nombre de tickets affectés.
 * Skippe les ids déjà supprimés ou inexistants (idempotent).
 */
export async function softDeleteTickets(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await prisma.ticket.updateMany({
    where: { id: { in: ids }, status: { not: "DELETED" as any } },
    data: { status: "DELETED" as any },
  });
  return res.count;
}

/**
 * Restaure des tickets depuis la corbeille → status=NEW.
 * L'agent peut ensuite re-classer manuellement si besoin.
 */
export async function restoreTickets(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await prisma.ticket.updateMany({
    where: { id: { in: ids }, status: "DELETED" as any },
    data: { status: "NEW" as any },
  });
  return res.count;
}

/**
 * Suppression DÉFINITIVE (hard delete) — utilisée uniquement depuis
 * la corbeille par un SUPER_ADMIN pour purger. Cascade DB (cf.
 * schéma : onDelete: Cascade sur les relations Ticket).
 */
export async function purgeTickets(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await prisma.ticket.deleteMany({
    where: { id: { in: ids }, status: "DELETED" as any },
  });
  return res.count;
}
