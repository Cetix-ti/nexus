import prisma from "@/lib/prisma";
import type { MonitoringAlertStage, Prisma } from "@prisma/client";

export const STAGE_LABELS: Record<MonitoringAlertStage, string> = {
  TRIAGE: "À trier",
  INVESTIGATING: "En investigation",
  WAITING_PARTS: "En attente de pièce",
  WAITING_VENDOR: "En attente fournisseur",
  WAITING_MAINTENANCE: "Fenêtre maintenance",
  RESOLVED: "Traité",
  IGNORED: "Ignoré",
};

export const STAGE_ORDER: MonitoringAlertStage[] = [
  "TRIAGE",
  "INVESTIGATING",
  "WAITING_PARTS",
  "WAITING_VENDOR",
  "WAITING_MAINTENANCE",
  "RESOLVED",
  "IGNORED",
];

export const STAGE_COLORS: Record<
  MonitoringAlertStage,
  { bg: string; text: string; ring: string; dot: string }
> = {
  TRIAGE: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200",
    dot: "bg-rose-500",
  },
  INVESTIGATING: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    dot: "bg-amber-500",
  },
  WAITING_PARTS: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    ring: "ring-violet-200",
    dot: "bg-violet-500",
  },
  WAITING_VENDOR: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
    dot: "bg-indigo-500",
  },
  WAITING_MAINTENANCE: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    ring: "ring-cyan-200",
    dot: "bg-cyan-500",
  },
  RESOLVED: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    dot: "bg-emerald-500",
  },
  IGNORED: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    ring: "ring-slate-200",
    dot: "bg-slate-400",
  },
};

export interface MonitoringAlertRow {
  id: string;
  number: number;
  subject: string;
  organizationName: string;
  organizationId: string;
  requesterEmail: string | null;
  sourceId: string | null;
  sourceLabel: string | null;
  sourceColor: string | null;
  stage: MonitoringAlertStage;
  priority: string;
  createdAt: string;
  updatedAt: string;
  assigneeName: string | null;
  notes: string | null;
}

export async function listAlerts(opts: {
  stage?: MonitoringAlertStage | null;
  sourceId?: string | null;
  organizationId?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<MonitoringAlertRow[]> {
  const where: Prisma.TicketWhereInput = {
    monitoringSourceId: { not: null },
  };
  if (opts.stage) where.monitoringStage = opts.stage;
  if (opts.sourceId) where.monitoringSourceId = opts.sourceId;
  if (opts.organizationId) where.organizationId = opts.organizationId;
  if (opts.search) {
    where.OR = [
      { subject: { contains: opts.search, mode: "insensitive" } },
      { description: { contains: opts.search, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.ticket.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: opts.limit ?? 500,
    include: {
      organization: { select: { id: true, name: true } },
      requester: { select: { email: true } },
      assignee: { select: { firstName: true, lastName: true } },
      monitoringSource: { select: { id: true, label: true, color: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    number: t.number,
    subject: t.subject,
    organizationName: t.organization.name,
    organizationId: t.organizationId,
    requesterEmail: t.requester?.email ?? null,
    sourceId: t.monitoringSource?.id ?? null,
    sourceLabel: t.monitoringSource?.label ?? null,
    sourceColor: t.monitoringSource?.color ?? null,
    stage: t.monitoringStage ?? "TRIAGE",
    priority: t.priority,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    assigneeName: t.assignee
      ? `${t.assignee.firstName} ${t.assignee.lastName}`.trim()
      : null,
    notes: t.monitoringNotes,
  }));
}

export async function stageCounts(): Promise<
  Record<MonitoringAlertStage, number>
> {
  const groups = await prisma.ticket.groupBy({
    by: ["monitoringStage"],
    where: { monitoringSourceId: { not: null } },
    _count: { _all: true },
  });
  const out = {
    TRIAGE: 0,
    INVESTIGATING: 0,
    WAITING_PARTS: 0,
    WAITING_VENDOR: 0,
    WAITING_MAINTENANCE: 0,
    RESOLVED: 0,
    IGNORED: 0,
  } as Record<MonitoringAlertStage, number>;
  for (const g of groups) {
    if (g.monitoringStage) out[g.monitoringStage] = g._count._all;
  }
  return out;
}

export async function updateAlertStage(
  ticketId: string,
  stage: MonitoringAlertStage,
  notes?: string | null
) {
  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      monitoringStage: stage,
      ...(notes !== undefined ? { monitoringNotes: notes } : {}),
    },
  });
}

// ----------------------------------------------------------------------------
// Sources CRUD
// ----------------------------------------------------------------------------

export async function listSources() {
  return prisma.monitoringAlertSource.findMany({
    orderBy: [{ isActive: "desc" }, { label: "asc" }],
  });
}

export async function createSource(input: {
  emailOrPattern: string;
  label: string;
  color?: string;
  isActive?: boolean;
}) {
  return prisma.monitoringAlertSource.create({
    data: {
      emailOrPattern: input.emailOrPattern.toLowerCase().trim(),
      label: input.label,
      color: input.color ?? "#3B82F6",
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateSource(
  id: string,
  patch: {
    emailOrPattern?: string;
    label?: string;
    color?: string;
    isActive?: boolean;
  }
) {
  return prisma.monitoringAlertSource.update({
    where: { id },
    data: {
      ...(patch.emailOrPattern
        ? { emailOrPattern: patch.emailOrPattern.toLowerCase().trim() }
        : {}),
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  });
}

export async function deleteSource(id: string) {
  return prisma.monitoringAlertSource.delete({ where: { id } });
}

/**
 * Re-marque les tickets existants dont le requester correspond à une source
 * active. Idempotent — ne touche pas les tickets déjà marqués.
 * Renvoie le nombre de tickets affectés.
 */
export async function rebackfill(): Promise<number> {
  const sources = await prisma.monitoringAlertSource.findMany({
    where: { isActive: true },
  });
  let total = 0;
  for (const s of sources) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE tickets t
       SET monitoring_source_id = $1,
           monitoring_stage = COALESCE(t.monitoring_stage,
             CASE
               WHEN t.status IN ('RESOLVED','CLOSED') THEN 'RESOLVED'::"MonitoringAlertStage"
               WHEN t.status = 'IN_PROGRESS' THEN 'INVESTIGATING'::"MonitoringAlertStage"
               ELSE 'TRIAGE'::"MonitoringAlertStage"
             END)
       FROM contacts c
       WHERE t.requester_id = c.id
         AND lower(c.email) LIKE '%' || $2 || '%'
         AND t.monitoring_source_id IS NULL`,
      s.id,
      s.emailOrPattern.toLowerCase()
    );
    total += result;
  }
  return total;
}
