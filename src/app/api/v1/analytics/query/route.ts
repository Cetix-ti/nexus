import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * POST /api/v1/analytics/query
 *
 * Universal data query engine for custom widgets.
 * Accepts a query definition and returns processed results.
 *
 * Body:
 * {
 *   dataset: "tickets" | "time_entries" | "contacts" | "organizations" | "contracts" | "assets" | "projects" | "invoices" | "expenses" | "purchase_orders",
 *   filters: [{ field: "status", operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "in" | "contains", value: any }],
 *   groupBy: "status" | "priority" | "organizationName" | ... (field name),
 *   aggregate: "count" | "sum" | "avg" | "min" | "max",
 *   aggregateField: "durationMinutes" | "amount" | ... (for sum/avg/min/max),
 *   sortBy: "value" | "label",
 *   sortDir: "asc" | "desc",
 *   limit: number,
 *   dateField: "createdAt" | "startedAt" | ...,
 *   dateFrom: ISO string,
 *   dateTo: ISO string,
 * }
 */

// Dataset definitions with their queryable fields
const DATASETS: Record<string, {
  model: string;
  fields: { name: string; label: string; type: string; groupable: boolean; aggregable: boolean }[];
  defaultDateField: string;
}> = {
  tickets: {
    model: "ticket",
    defaultDateField: "createdAt",
    fields: [
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "priority", label: "Priorité", type: "enum", groupable: true, aggregable: false },
      { name: "type", label: "Type", type: "enum", groupable: true, aggregable: false },
      { name: "urgency", label: "Urgence", type: "enum", groupable: true, aggregable: false },
      { name: "impact", label: "Impact", type: "enum", groupable: true, aggregable: false },
      { name: "source", label: "Source", type: "enum", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "assigneeId", label: "Assigné à", type: "relation", groupable: true, aggregable: false },
      { name: "categoryId", label: "Catégorie", type: "relation", groupable: true, aggregable: false },
      { name: "queueId", label: "File d'attente", type: "relation", groupable: true, aggregable: false },
      { name: "slaBreached", label: "SLA dépassé", type: "boolean", groupable: true, aggregable: false },
      { name: "isOverdue", label: "En retard", type: "boolean", groupable: true, aggregable: false },
      { name: "isEscalated", label: "Escaladé", type: "boolean", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de création", type: "date", groupable: false, aggregable: false },
      { name: "resolvedAt", label: "Date de résolution", type: "date", groupable: false, aggregable: false },
      { name: "number", label: "Numéro", type: "number", groupable: false, aggregable: true },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  time_entries: {
    model: "timeEntry",
    defaultDateField: "startedAt",
    fields: [
      { name: "coverageStatus", label: "Couverture", type: "enum", groupable: true, aggregable: false },
      { name: "timeType", label: "Type de temps", type: "string", groupable: true, aggregable: false },
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
      { name: "startedAt", label: "Date de début", type: "date", groupable: false, aggregable: false },
    ],
  },
  contacts: {
    model: "contact",
    defaultDateField: "createdAt",
    fields: [
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "isVIP", label: "VIP", type: "boolean", groupable: true, aggregable: false },
      { name: "isActive", label: "Actif", type: "boolean", groupable: true, aggregable: false },
      { name: "jobTitle", label: "Poste", type: "string", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  organizations: {
    model: "organization",
    defaultDateField: "createdAt",
    fields: [
      { name: "plan", label: "Plan", type: "string", groupable: true, aggregable: false },
      { name: "isActive", label: "Actif", type: "boolean", groupable: true, aggregable: false },
      { name: "portalEnabled", label: "Portail activé", type: "boolean", groupable: true, aggregable: false },
      { name: "city", label: "Ville", type: "string", groupable: true, aggregable: false },
      { name: "province", label: "Province", type: "string", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  contracts: {
    model: "contract",
    defaultDateField: "createdAt",
    fields: [
      { name: "type", label: "Type", type: "enum", groupable: true, aggregable: false },
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "monthlyHours", label: "Heures mensuelles", type: "number", groupable: false, aggregable: true },
      { name: "hourlyRate", label: "Taux horaire", type: "number", groupable: false, aggregable: true },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  assets: {
    model: "asset",
    defaultDateField: "createdAt",
    fields: [
      { name: "type", label: "Type", type: "string", groupable: true, aggregable: false },
      { name: "status", label: "Statut", type: "string", groupable: true, aggregable: false },
      { name: "source", label: "Source", type: "string", groupable: true, aggregable: false },
      { name: "manufacturer", label: "Fabricant", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "siteId", label: "Site", type: "relation", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  projects: {
    model: "project",
    defaultDateField: "createdAt",
    fields: [
      { name: "status", label: "Statut", type: "string", groupable: true, aggregable: false },
      { name: "type", label: "Type", type: "string", groupable: true, aggregable: false },
      { name: "priority", label: "Priorité", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "managerId", label: "Gestionnaire", type: "relation", groupable: true, aggregable: false },
      { name: "isAtRisk", label: "À risque", type: "boolean", groupable: true, aggregable: false },
      { name: "progressPercent", label: "Progression (%)", type: "number", groupable: false, aggregable: true },
      { name: "consumedHours", label: "Heures consommées", type: "number", groupable: false, aggregable: true },
      { name: "budgetHours", label: "Budget heures", type: "number", groupable: false, aggregable: true },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  expense_reports: {
    model: "expenseReport",
    defaultDateField: "createdAt",
    fields: [
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "submitterId", label: "Soumetteur", type: "relation", groupable: true, aggregable: false },
      { name: "totalAmount", label: "Montant total", type: "number", groupable: false, aggregable: true },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  purchase_orders: {
    model: "purchaseOrder",
    defaultDateField: "createdAt",
    fields: [
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "vendorName", label: "Fournisseur", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "requestedById", label: "Demandé par", type: "relation", groupable: true, aggregable: false },
      { name: "totalAmount", label: "Montant total", type: "number", groupable: false, aggregable: true },
      { name: "subtotal", label: "Sous-total", type: "number", groupable: false, aggregable: true },
      { name: "taxAmount", label: "Taxes", type: "number", groupable: false, aggregable: true },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
};

// Relation name resolution
const RELATION_INCLUDES: Record<string, any> = {
  organizationId: { organization: { select: { name: true } } },
  assigneeId: { assignee: { select: { firstName: true, lastName: true } } },
  categoryId: { category: { select: { name: true } } },
  queueId: { queue: { select: { name: true } } },
  agentId: false, // handled in post-processing
  submitterId: { submitter: { select: { firstName: true, lastName: true } } },
  requestedById: { requestedBy: { select: { firstName: true, lastName: true } } },
  managerId: { manager: { select: { firstName: true, lastName: true } } },
  siteId: { site: { select: { name: true } } },
};

function resolveRelationLabel(row: any, groupField: string): string {
  if (groupField === "organizationId") return row.organization?.name ?? row.organizationId ?? "—";
  if (groupField === "assigneeId") return row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : "Non assigné";
  if (groupField === "categoryId") return row.category?.name ?? "Sans catégorie";
  if (groupField === "queueId") return row.queue?.name ?? "Sans file";
  if (groupField === "agentId") return row.agentName ?? row.agentId ?? "—";
  if (groupField === "submitterId") return row.submitter ? `${row.submitter.firstName} ${row.submitter.lastName}` : "—";
  if (groupField === "requestedById") return row.requestedBy ? `${row.requestedBy.firstName} ${row.requestedBy.lastName}` : "—";
  if (groupField === "managerId") return row.manager ? `${row.manager.firstName} ${row.manager.lastName}` : "—";
  if (groupField === "siteId") return row.site?.name ?? "Sans site";
  if (groupField === "ticketId") return row.ticketId ?? "—";
  return String(row[groupField] ?? "—");
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Return available datasets and their fields
  return NextResponse.json({
    datasets: Object.entries(DATASETS).map(([id, d]) => ({
      id,
      label: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      fields: d.fields,
      defaultDateField: d.defaultDateField,
    })),
    aggregates: ["count", "sum", "avg", "min", "max"],
    operators: ["eq", "neq", "gt", "lt", "gte", "lte", "in", "contains"],
  });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { dataset, filters = [], groupBy, aggregate = "count", aggregateField, sortBy = "value", sortDir = "desc", limit = 50, dateField, dateFrom, dateTo } = body;

    const def = DATASETS[dataset];
    if (!def) return NextResponse.json({ error: `Dataset "${dataset}" inconnu` }, { status: 400 });

    // Build where clause
    const where: Record<string, any> = {};

    // Date filter
    const df = dateField || def.defaultDateField;
    if (dateFrom || dateTo) {
      where[df] = {};
      if (dateFrom) where[df].gte = new Date(dateFrom);
      if (dateTo) where[df].lte = new Date(dateTo);
    }

    // Custom filters
    for (const f of filters) {
      if (!f.field || f.value === undefined) continue;
      switch (f.operator) {
        case "eq": where[f.field] = f.value; break;
        case "neq": where[f.field] = { not: f.value }; break;
        case "gt": where[f.field] = { gt: Number(f.value) }; break;
        case "lt": where[f.field] = { lt: Number(f.value) }; break;
        case "gte": where[f.field] = { gte: Number(f.value) }; break;
        case "lte": where[f.field] = { lte: Number(f.value) }; break;
        case "in": where[f.field] = { in: Array.isArray(f.value) ? f.value : String(f.value).split(",").map((s: string) => s.trim()) }; break;
        case "contains": where[f.field] = { contains: f.value, mode: "insensitive" }; break;
      }
    }

    const model = (prisma as any)[def.model];
    if (!model) return NextResponse.json({ error: "Modèle introuvable" }, { status: 500 });

    // If groupBy is specified, use Prisma groupBy
    if (groupBy) {
      const fieldDef = def.fields.find((f) => f.name === groupBy);

      // For relation fields, we need to fetch all records and group in JS
      if (fieldDef?.type === "relation") {
        const include = RELATION_INCLUDES[groupBy] || {};
        const rows = await model.findMany({ where, include: include || undefined, take: 5000 });

        // Group manually
        const groups = new Map<string, { label: string; count: number; sum: number; values: number[] }>();
        for (const row of rows) {
          const label = resolveRelationLabel(row, groupBy);
          const g = groups.get(label) || { label, count: 0, sum: 0, values: [] };
          g.count += 1;
          if (aggregateField && row[aggregateField] != null) {
            const val = Number(row[aggregateField]);
            g.sum += val;
            g.values.push(val);
          }
          groups.set(label, g);
        }

        let results = Array.from(groups.values()).map((g) => ({
          label: g.label,
          value: aggregate === "count" ? g.count
            : aggregate === "sum" ? Math.round(g.sum * 100) / 100
            : aggregate === "avg" ? (g.values.length ? Math.round((g.sum / g.values.length) * 100) / 100 : 0)
            : aggregate === "min" ? (g.values.length ? Math.min(...g.values) : 0)
            : aggregate === "max" ? (g.values.length ? Math.max(...g.values) : 0)
            : g.count,
        }));

        results.sort((a, b) => sortBy === "label" ? a.label.localeCompare(b.label) : (sortDir === "asc" ? a.value - b.value : b.value - a.value));
        results = results.slice(0, limit);

        return NextResponse.json({ results, total: rows.length, groupedBy: groupBy, aggregate });
      }

      // For non-relation fields, use Prisma groupBy
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
        take: limit,
      });

      let results = groupResult.map((r: any) => {
        const rawLabel = r[groupBy];
        return {
          label: rawLabel === true ? "Oui" : rawLabel === false ? "Non" : String(rawLabel ?? "—"),
          value: aggregate === "count" ? (typeof r._count === "number" ? r._count : r._count?._all ?? 0)
            : aggregate === "sum" ? (r._sum?.[aggregateField!] ?? 0)
            : aggregate === "avg" ? Math.round((r._avg?.[aggregateField!] ?? 0) * 100) / 100
            : aggregate === "min" ? (r._min?.[aggregateField!] ?? 0)
            : aggregate === "max" ? (r._max?.[aggregateField!] ?? 0)
            : (typeof r._count === "number" ? r._count : r._count?._all ?? 0),
        };
      });

      results.sort((a: any, b: any) => sortBy === "label" ? a.label.localeCompare(b.label) : (sortDir === "asc" ? a.value - b.value : b.value - a.value));

      return NextResponse.json({ results, total: results.length, groupedBy: groupBy, aggregate });
    }

    // No groupBy — return aggregate total
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
