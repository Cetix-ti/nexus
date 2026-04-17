import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * POST /api/v1/analytics/query
 *
 * Moteur de requête universel pour les widgets personnalisés.
 *
 * Extensions :
 *   - 12 datasets (tickets, time_entries, contacts, organizations,
 *     contracts, assets, projects, expense_reports, purchase_orders,
 *     monitoring_alerts, security_alerts, calendar_events)
 *   - 8 agrégations : count, count_distinct, sum, avg, min, max, median, percentage
 *   - 10 opérateurs de filtre : eq, neq, gt, lt, gte, lte, in, contains, isnull, between
 *   - Grouping temporel : _by_day, _by_week, _by_month, _by_quarter, _by_year
 */

// ============================================================================
// Dataset definitions
// ============================================================================

interface FieldDef {
  name: string;
  label: string;
  type: "enum" | "string" | "number" | "boolean" | "date" | "relation";
  groupable: boolean;
  aggregable: boolean;
}

interface DatasetDef {
  model: string;
  fields: FieldDef[];
  defaultDateField: string;
  dateFields: string[];
}

const DATASETS: Record<string, DatasetDef> = {
  tickets: {
    model: "ticket",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "resolvedAt", "closedAt", "dueAt", "firstResponseAt"],
    fields: [
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "priority", label: "Priorité", type: "enum", groupable: true, aggregable: false },
      { name: "type", label: "Type", type: "enum", groupable: true, aggregable: false },
      { name: "urgency", label: "Urgence", type: "enum", groupable: true, aggregable: false },
      { name: "impact", label: "Impact", type: "enum", groupable: true, aggregable: false },
      { name: "source", label: "Source", type: "enum", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "assigneeId", label: "Assigné à", type: "relation", groupable: true, aggregable: false },
      { name: "creatorId", label: "Créé par", type: "relation", groupable: true, aggregable: false },
      { name: "categoryId", label: "Catégorie", type: "relation", groupable: true, aggregable: false },
      { name: "queueId", label: "File d'attente", type: "relation", groupable: true, aggregable: false },
      { name: "slaBreached", label: "SLA dépassé", type: "boolean", groupable: true, aggregable: false },
      { name: "isOverdue", label: "En retard", type: "boolean", groupable: true, aggregable: false },
      { name: "isEscalated", label: "Escaladé", type: "boolean", groupable: true, aggregable: false },
      { name: "isInternal", label: "Interne", type: "boolean", groupable: true, aggregable: false },
      { name: "monitoringStage", label: "Stage monitoring", type: "string", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "resolvedAt", label: "Date de résolution", type: "date", groupable: true, aggregable: false },
      { name: "closedAt", label: "Date de fermeture", type: "date", groupable: true, aggregable: false },
      { name: "dueAt", label: "Échéance SLA", type: "date", groupable: true, aggregable: false },
      { name: "number", label: "Numéro", type: "number", groupable: false, aggregable: true },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  time_entries: {
    model: "timeEntry",
    defaultDateField: "startedAt",
    dateFields: ["startedAt", "endedAt", "createdAt"],
    fields: [
      { name: "coverageStatus", label: "Couverture", type: "enum", groupable: true, aggregable: false },
      { name: "timeType", label: "Type de temps", type: "string", groupable: true, aggregable: false },
      { name: "approvalStatus", label: "Statut approbation", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "agentId", label: "Technicien", type: "relation", groupable: true, aggregable: false },
      { name: "ticketId", label: "Ticket", type: "relation", groupable: true, aggregable: false },
      { name: "isOnsite", label: "Sur place", type: "boolean", groupable: true, aggregable: false },
      { name: "isAfterHours", label: "Hors heures", type: "boolean", groupable: true, aggregable: false },
      { name: "isWeekend", label: "Fin de semaine", type: "boolean", groupable: true, aggregable: false },
      { name: "isUrgent", label: "Urgent", type: "boolean", groupable: true, aggregable: false },
      { name: "durationMinutes", label: "Durée (min)", type: "number", groupable: false, aggregable: true },
      { name: "amount", label: "Montant ($)", type: "number", groupable: false, aggregable: true },
      { name: "hourlyRate", label: "Taux horaire ($)", type: "number", groupable: false, aggregable: true },
      { name: "startedAt", label: "Date de début", type: "date", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de saisie", type: "date", groupable: true, aggregable: false },
    ],
  },
  contacts: {
    model: "contact",
    defaultDateField: "createdAt",
    dateFields: ["createdAt"],
    fields: [
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "isVIP", label: "VIP", type: "boolean", groupable: true, aggregable: false },
      { name: "isActive", label: "Actif", type: "boolean", groupable: true, aggregable: false },
      { name: "portalEnabled", label: "Portail activé", type: "boolean", groupable: true, aggregable: false },
      { name: "jobTitle", label: "Poste", type: "string", groupable: true, aggregable: false },
      { name: "city", label: "Ville", type: "string", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  organizations: {
    model: "organization",
    defaultDateField: "createdAt",
    dateFields: ["createdAt"],
    fields: [
      { name: "plan", label: "Plan", type: "string", groupable: true, aggregable: false },
      { name: "isActive", label: "Actif", type: "boolean", groupable: true, aggregable: false },
      { name: "isInternal", label: "Interne", type: "boolean", groupable: true, aggregable: false },
      { name: "portalEnabled", label: "Portail activé", type: "boolean", groupable: true, aggregable: false },
      { name: "city", label: "Ville", type: "string", groupable: true, aggregable: false },
      { name: "province", label: "Province", type: "string", groupable: true, aggregable: false },
      { name: "clientCode", label: "Code client", type: "string", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  contracts: {
    model: "contract",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "startDate", "endDate"],
    fields: [
      { name: "type", label: "Type", type: "enum", groupable: true, aggregable: false },
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "monthlyHours", label: "Heures mensuelles", type: "number", groupable: false, aggregable: true },
      { name: "hourlyRate", label: "Taux horaire", type: "number", groupable: false, aggregable: true },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  assets: {
    model: "asset",
    defaultDateField: "createdAt",
    dateFields: ["createdAt"],
    fields: [
      { name: "type", label: "Type", type: "string", groupable: true, aggregable: false },
      { name: "status", label: "Statut", type: "string", groupable: true, aggregable: false },
      { name: "source", label: "Source", type: "string", groupable: true, aggregable: false },
      { name: "manufacturer", label: "Fabricant", type: "string", groupable: true, aggregable: false },
      { name: "os", label: "Système d'exploitation", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "siteId", label: "Site", type: "relation", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  projects: {
    model: "project",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "startDate", "endDate"],
    fields: [
      { name: "status", label: "Statut", type: "string", groupable: true, aggregable: false },
      { name: "type", label: "Type", type: "string", groupable: true, aggregable: false },
      { name: "priority", label: "Priorité", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "managerId", label: "Gestionnaire", type: "relation", groupable: true, aggregable: false },
      { name: "isAtRisk", label: "À risque", type: "boolean", groupable: true, aggregable: false },
      { name: "isArchived", label: "Archivé", type: "boolean", groupable: true, aggregable: false },
      { name: "progressPercent", label: "Progression (%)", type: "number", groupable: false, aggregable: true },
      { name: "consumedHours", label: "Heures consommées", type: "number", groupable: false, aggregable: true },
      { name: "budgetHours", label: "Budget heures", type: "number", groupable: false, aggregable: true },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  expense_reports: {
    model: "expenseReport",
    defaultDateField: "createdAt",
    dateFields: ["createdAt"],
    fields: [
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "submitterId", label: "Soumetteur", type: "relation", groupable: true, aggregable: false },
      { name: "totalAmount", label: "Montant total", type: "number", groupable: false, aggregable: true },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  purchase_orders: {
    model: "purchaseOrder",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "expectedDate", "receivedDate"],
    fields: [
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "vendorName", label: "Fournisseur", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "requestedById", label: "Demandé par", type: "relation", groupable: true, aggregable: false },
      { name: "currency", label: "Devise", type: "string", groupable: true, aggregable: false },
      { name: "totalAmount", label: "Montant total", type: "number", groupable: false, aggregable: true },
      { name: "subtotal", label: "Sous-total", type: "number", groupable: false, aggregable: true },
      { name: "taxAmount", label: "Taxes", type: "number", groupable: false, aggregable: true },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  monitoring_alerts: {
    model: "monitoringAlert",
    defaultDateField: "receivedAt",
    dateFields: ["receivedAt", "resolvedAt"],
    fields: [
      { name: "sourceType", label: "Source", type: "string", groupable: true, aggregable: false },
      { name: "severity", label: "Sévérité", type: "string", groupable: true, aggregable: false },
      { name: "stage", label: "Stage", type: "string", groupable: true, aggregable: false },
      { name: "messageKind", label: "Type de message", type: "string", groupable: true, aggregable: false },
      { name: "isResolved", label: "Résolu", type: "boolean", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "receivedAt", label: "Date de réception", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  security_alerts: {
    model: "securityAlert",
    defaultDateField: "receivedAt",
    dateFields: ["receivedAt"],
    fields: [
      { name: "source", label: "Source", type: "string", groupable: true, aggregable: false },
      { name: "kind", label: "Type", type: "string", groupable: true, aggregable: false },
      { name: "severity", label: "Sévérité", type: "string", groupable: true, aggregable: false },
      { name: "isLowPriority", label: "Basse priorité", type: "boolean", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "endpoint", label: "Endpoint", type: "string", groupable: true, aggregable: false },
      { name: "receivedAt", label: "Date de réception", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  calendar_events: {
    model: "calendarEvent",
    defaultDateField: "startsAt",
    dateFields: ["startsAt", "endsAt", "createdAt"],
    fields: [
      { name: "kind", label: "Type", type: "enum", groupable: true, aggregable: false },
      { name: "allDay", label: "Journée complète", type: "boolean", groupable: true, aggregable: false },
      { name: "location", label: "Lieu", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "ownerId", label: "Propriétaire", type: "relation", groupable: true, aggregable: false },
      { name: "startsAt", label: "Date de début", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
};

// ============================================================================
// Relation resolution
// ============================================================================

const RELATION_INCLUDES: Record<string, unknown> = {
  organizationId: { organization: { select: { name: true } } },
  assigneeId: { assignee: { select: { firstName: true, lastName: true } } },
  creatorId: { creator: { select: { firstName: true, lastName: true } } },
  categoryId: { category: { select: { name: true } } },
  queueId: { queue: { select: { name: true } } },
  agentId: false,
  submitterId: { submitter: { select: { firstName: true, lastName: true } } },
  requestedById: { requestedBy: { select: { firstName: true, lastName: true } } },
  managerId: { manager: { select: { firstName: true, lastName: true } } },
  siteId: { site: { select: { name: true } } },
  ownerId: { owner: { select: { firstName: true, lastName: true } } },
};

function resolveRelationLabel(row: any, groupField: string): string {
  if (groupField === "organizationId") return row.organization?.name ?? row.organizationId ?? "—";
  if (groupField === "assigneeId") return row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : "Non assigné";
  if (groupField === "creatorId") return row.creator ? `${row.creator.firstName} ${row.creator.lastName}` : "—";
  if (groupField === "categoryId") return row.category?.name ?? "Sans catégorie";
  if (groupField === "queueId") return row.queue?.name ?? "Sans file";
  if (groupField === "agentId") return row.agentName ?? row.agentId ?? "—";
  if (groupField === "submitterId") return row.submitter ? `${row.submitter.firstName} ${row.submitter.lastName}` : "—";
  if (groupField === "requestedById") return row.requestedBy ? `${row.requestedBy.firstName} ${row.requestedBy.lastName}` : "—";
  if (groupField === "managerId") return row.manager ? `${row.manager.firstName} ${row.manager.lastName}` : "—";
  if (groupField === "siteId") return row.site?.name ?? "Sans site";
  if (groupField === "ownerId") return row.owner ? `${row.owner.firstName} ${row.owner.lastName}` : "—";
  if (groupField === "ticketId") return row.ticketId ?? "—";
  return String(row[groupField] ?? "—");
}

// ============================================================================
// Date bucketing helper — _by_day, _by_week, _by_month, _by_quarter, _by_year
// ============================================================================

const DATE_BUCKET_SUFFIXES = ["_by_day", "_by_week", "_by_month", "_by_quarter", "_by_year"] as const;
type DateBucket = typeof DATE_BUCKET_SUFFIXES[number];

function isDateBucketGroup(field: string): { baseField: string; bucket: DateBucket } | null {
  for (const suffix of DATE_BUCKET_SUFFIXES) {
    if (field.endsWith(suffix)) {
      return { baseField: field.slice(0, -suffix.length), bucket: suffix };
    }
  }
  return null;
}

function dateToBucketLabel(d: Date, bucket: DateBucket): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  switch (bucket) {
    case "_by_day": return `${yyyy}-${mm}-${dd}`;
    case "_by_week": {
      const jan1 = new Date(yyyy, 0, 1);
      const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
      return `${yyyy}-S${String(week).padStart(2, "0")}`;
    }
    case "_by_month": return `${yyyy}-${mm}`;
    case "_by_quarter": return `${yyyy}-T${Math.ceil((d.getMonth() + 1) / 3)}`;
    case "_by_year": return `${yyyy}`;
  }
}

// ============================================================================
// Aggregation helpers
// ============================================================================

function computeAggregate(
  aggregate: string,
  values: number[],
  count: number,
  total: number,
): number {
  if (aggregate === "count") return count;
  if (aggregate === "count_distinct") return new Set(values).size;
  if (aggregate === "sum") return Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100;
  if (aggregate === "avg") return values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100 : 0;
  if (aggregate === "min") return values.length ? Math.min(...values) : 0;
  if (aggregate === "max") return values.length ? Math.max(...values) : 0;
  if (aggregate === "median") {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100
      : sorted[mid];
  }
  if (aggregate === "percentage") {
    return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  }
  return count;
}

// ============================================================================
// GET — expose metadata for the widget editor
// ============================================================================

const ALL_AGGREGATES = [
  { id: "count", label: "Nombre" },
  { id: "count_distinct", label: "Nombre distinct" },
  { id: "sum", label: "Somme" },
  { id: "avg", label: "Moyenne" },
  { id: "min", label: "Minimum" },
  { id: "max", label: "Maximum" },
  { id: "median", label: "Médiane" },
  { id: "percentage", label: "Pourcentage (%)" },
];

const ALL_OPERATORS = [
  { id: "eq", label: "Égal à" },
  { id: "neq", label: "Différent de" },
  { id: "gt", label: "Plus grand que" },
  { id: "lt", label: "Plus petit que" },
  { id: "gte", label: "≥" },
  { id: "lte", label: "≤" },
  { id: "in", label: "Dans la liste" },
  { id: "contains", label: "Contient" },
  { id: "isnull", label: "Est vide" },
  { id: "between", label: "Entre" },
];

const CHART_TYPES = [
  { id: "number", label: "Chiffre (KPI)" },
  { id: "progress", label: "Jauge (%)" },
  { id: "bar", label: "Barres verticales" },
  { id: "horizontal_bar", label: "Barres horizontales" },
  { id: "stacked_bar", label: "Barres empilées" },
  { id: "line", label: "Courbe" },
  { id: "area", label: "Aire" },
  { id: "combo", label: "Combiné (barres + courbe)" },
  { id: "pie", label: "Camembert" },
  { id: "donut", label: "Anneau (donut)" },
  { id: "scatter", label: "Nuage de points" },
  { id: "radar", label: "Radar" },
  { id: "funnel", label: "Entonnoir" },
  { id: "treemap", label: "Treemap" },
  { id: "heatmap", label: "Carte de chaleur" },
  { id: "gauge", label: "Jauge à aiguille" },
  { id: "sankey", label: "Sankey (flux)" },
  { id: "table", label: "Tableau" },
  { id: "list", label: "Liste" },
];

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    datasets: Object.entries(DATASETS).map(([id, d]) => ({
      id,
      label: {
        tickets: "Tickets",
        time_entries: "Saisies de temps",
        contacts: "Contacts",
        organizations: "Organisations",
        contracts: "Contrats",
        assets: "Actifs",
        projects: "Projets",
        expense_reports: "Comptes de dépenses",
        purchase_orders: "Bons de commande",
        monitoring_alerts: "Alertes monitoring",
        security_alerts: "Alertes sécurité",
        calendar_events: "Événements calendrier",
      }[id] ?? id,
      fields: d.fields,
      dateFields: d.dateFields,
      defaultDateField: d.defaultDateField,
    })),
    aggregates: ALL_AGGREGATES,
    operators: ALL_OPERATORS,
    chartTypes: CHART_TYPES,
    dateBuckets: [
      { id: "_by_day", label: "Par jour" },
      { id: "_by_week", label: "Par semaine" },
      { id: "_by_month", label: "Par mois" },
      { id: "_by_quarter", label: "Par trimestre" },
      { id: "_by_year", label: "Par année" },
    ],
  });
}

// ============================================================================
// POST — execute query
// ============================================================================

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      dataset,
      filters = [],
      groupBy,
      aggregate = "count",
      aggregateField,
      sortBy = "value",
      sortDir = "desc",
      limit = 50,
      dateField,
      dateFrom,
      dateTo,
    } = body;

    const def = DATASETS[dataset];
    if (!def) return NextResponse.json({ error: `Dataset "${dataset}" inconnu` }, { status: 400 });

    // Build where clause
    const where: Record<string, unknown> = {};
    const df = dateField || def.defaultDateField;
    if (dateFrom || dateTo) {
      where[df] = {};
      if (dateFrom) (where[df] as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where[df] as Record<string, unknown>).lte = new Date(dateTo);
    }

    for (const f of filters) {
      if (!f.field || (f.value === undefined && f.operator !== "isnull")) continue;
      switch (f.operator) {
        case "eq": where[f.field] = f.value; break;
        case "neq": where[f.field] = { not: f.value }; break;
        case "gt": where[f.field] = { gt: Number(f.value) }; break;
        case "lt": where[f.field] = { lt: Number(f.value) }; break;
        case "gte": where[f.field] = { gte: Number(f.value) }; break;
        case "lte": where[f.field] = { lte: Number(f.value) }; break;
        case "in": where[f.field] = { in: Array.isArray(f.value) ? f.value : String(f.value).split(",").map((s: string) => s.trim()) }; break;
        case "contains": where[f.field] = { contains: f.value, mode: "insensitive" }; break;
        case "isnull": where[f.field] = f.value === false ? { not: null } : null; break;
        case "between": {
          const [lo, hi] = Array.isArray(f.value) ? f.value : String(f.value).split(",");
          where[f.field] = { gte: Number(lo), lte: Number(hi) };
          break;
        }
      }
    }

    const model = (prisma as any)[def.model];
    if (!model) return NextResponse.json({ error: "Modèle introuvable" }, { status: 500 });

    // Check for date bucket grouping
    const dateBucket = groupBy ? isDateBucketGroup(groupBy) : null;

    if (dateBucket) {
      const rows = await model.findMany({ where, select: { [dateBucket.baseField]: true, ...(aggregateField ? { [aggregateField]: true } : {}) }, take: 5000 });
      const totalRows = rows.length;
      const groups = new Map<string, { count: number; values: number[] }>();
      for (const row of rows) {
        const d = row[dateBucket.baseField];
        if (!d) continue;
        const label = dateToBucketLabel(new Date(d), dateBucket.bucket);
        const g = groups.get(label) ?? { count: 0, values: [] };
        g.count += 1;
        if (aggregateField && row[aggregateField] != null) g.values.push(Number(row[aggregateField]));
        groups.set(label, g);
      }
      let results = Array.from(groups.entries())
        .map(([label, g]) => ({
          label,
          value: computeAggregate(aggregate, g.values, g.count, totalRows),
        }));
      results.sort((a, b) => sortBy === "label" ? a.label.localeCompare(b.label) : (sortDir === "asc" ? a.value - b.value : b.value - a.value));
      results = results.slice(0, limit);
      return NextResponse.json({ results, total: totalRows, groupedBy: groupBy, aggregate });
    }

    // Relation groupBy
    if (groupBy) {
      const fieldDef = def.fields.find((f) => f.name === groupBy);

      if (fieldDef?.type === "relation") {
        const includeSpec = RELATION_INCLUDES[groupBy];
        const rows = await model.findMany({ where, ...(includeSpec ? { include: includeSpec } : {}), take: 5000 });
        const totalRows = rows.length;
        const groups = new Map<string, { label: string; count: number; values: number[] }>();
        for (const row of rows) {
          const label = resolveRelationLabel(row, groupBy);
          const g = groups.get(label) ?? { label, count: 0, values: [] };
          g.count += 1;
          if (aggregateField && row[aggregateField] != null) g.values.push(Number(row[aggregateField]));
          groups.set(label, g);
        }
        let results = Array.from(groups.values()).map((g) => ({
          label: g.label,
          value: computeAggregate(aggregate, g.values, g.count, totalRows),
        }));
        results.sort((a, b) => sortBy === "label" ? a.label.localeCompare(b.label) : (sortDir === "asc" ? a.value - b.value : b.value - a.value));
        results = results.slice(0, limit);
        return NextResponse.json({ results, total: totalRows, groupedBy: groupBy, aggregate });
      }

      // Non-relation groupBy with Prisma
      const groupResult = await model.groupBy({
        by: [groupBy],
        where,
        _count: true,
        ...(aggregateField ? {
          _sum: { [aggregateField]: true },
          _avg: { [aggregateField]: true },
          _min: { [aggregateField]: true },
          _max: { [aggregateField]: true },
        } : {}),
        take: Math.min(limit, 500),
      });

      // For percentage/median, we need total count
      const totalCount = aggregate === "percentage"
        ? await model.count({ where })
        : groupResult.reduce((s: number, r: any) => s + (typeof r._count === "number" ? r._count : r._count?._all ?? 0), 0);

      let results = groupResult.map((r: any) => {
        const rawLabel = r[groupBy];
        const cnt = typeof r._count === "number" ? r._count : r._count?._all ?? 0;
        let value: number;
        if (aggregate === "percentage") {
          value = totalCount > 0 ? Math.round((cnt / totalCount) * 1000) / 10 : 0;
        } else if (aggregate === "count") {
          value = cnt;
        } else {
          value = aggregate === "sum" ? (r._sum?.[aggregateField!] ?? 0)
            : aggregate === "avg" ? Math.round((r._avg?.[aggregateField!] ?? 0) * 100) / 100
            : aggregate === "min" ? (r._min?.[aggregateField!] ?? 0)
            : aggregate === "max" ? (r._max?.[aggregateField!] ?? 0)
            : cnt;
        }
        return {
          label: rawLabel === true ? "Oui" : rawLabel === false ? "Non" : rawLabel instanceof Date ? rawLabel.toISOString().slice(0, 10) : String(rawLabel ?? "—"),
          value,
        };
      });
      results.sort((a: any, b: any) => sortBy === "label" ? a.label.localeCompare(b.label) : (sortDir === "asc" ? a.value - b.value : b.value - a.value));
      return NextResponse.json({ results, total: totalCount, groupedBy: groupBy, aggregate });
    }

    // No groupBy
    if (aggregate === "count") {
      const count = await model.count({ where });
      return NextResponse.json({ results: [{ label: "Total", value: count }], total: count, aggregate: "count" });
    }
    if (aggregateField) {
      const agg = await model.aggregate({
        where,
        _sum: { [aggregateField]: true },
        _avg: { [aggregateField]: true },
        _min: { [aggregateField]: true },
        _max: { [aggregateField]: true },
        _count: true,
      });
      const val = aggregate === "sum" ? agg._sum?.[aggregateField]
        : aggregate === "avg" ? Math.round((agg._avg?.[aggregateField] ?? 0) * 100) / 100
        : aggregate === "min" ? agg._min?.[aggregateField]
        : aggregate === "max" ? agg._max?.[aggregateField]
        : agg._count;
      return NextResponse.json({ results: [{ label: "Total", value: val ?? 0 }], total: agg._count, aggregate });
    }
    const count = await model.count({ where });
    return NextResponse.json({ results: [{ label: "Total", value: count }], total: count, aggregate: "count" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur de requête" }, { status: 500 });
  }
}
