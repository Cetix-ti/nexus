// ============================================================================
// Handler in-memory pour les datasets QuickBooks.
//
// QBO n'est pas répliqué localement — chaque requête fetche live via le
// client `lib/quickbooks`. Les datasets analytics passent donc par ce
// handler qui applique filtres / groupBy / aggregate / sort côté
// serveur Node (pas en SQL). Pour de gros volumes, il faudrait persister
// QBO localement — mais pour quelques centaines/milliers de factures,
// ce filtrage en mémoire tient sans problème.
// ============================================================================

import {
  getInvoices,
  getCustomers,
  getPayments,
  getExpenses,
  getQboConfig,
} from "@/lib/quickbooks/client";

interface QboQueryInput {
  dataset: string;
  filters: Array<{ field: string; operator: string; value: any }>;
  groupBy?: string;
  aggregate: string;
  aggregateField?: string;
  sortBy: string;
  sortDir: string;
  limit: number;
  dateField?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface QboResult {
  results: Array<{ label: string; value: number }>;
  total: number;
  groupedBy?: string;
  aggregate: string;
  notConnected?: boolean;
}

/**
 * Exécute une requête analytics sur un dataset QBO. Renvoie la même
 * forme que les handlers Prisma (results[], total, aggregate, etc.).
 * Si QBO n'est pas connecté → renvoie un set vide + flag notConnected
 * pour que le widget affiche un état explicite.
 */
export async function runQboQuery(q: QboQueryInput): Promise<QboResult> {
  const config = await getQboConfig();
  if (!config?.accessToken || !config?.realmId) {
    return { results: [], total: 0, aggregate: q.aggregate, notConnected: true };
  }

  let rows: any[] = [];
  try {
    if (q.dataset === "qbo_invoices")       rows = await getInvoices(config);
    else if (q.dataset === "qbo_customers") rows = await getCustomers(config);
    else if (q.dataset === "qbo_payments")  rows = await getPayments(config);
    else if (q.dataset === "qbo_expenses")  rows = await getExpenses(config);
    else return { results: [], total: 0, aggregate: q.aggregate };
  } catch (err) {
    console.error("[qbo-handler] fetch failed", err);
    return { results: [], total: 0, aggregate: q.aggregate, notConnected: true };
  }

  // --- Filtres date range sur dateField ---
  const df = q.dateField;
  if (df && (q.dateFrom || q.dateTo)) {
    const fromTs = q.dateFrom ? new Date(q.dateFrom).getTime() : -Infinity;
    const toTs = q.dateTo ? new Date(q.dateTo).getTime() : Infinity;
    rows = rows.filter((r) => {
      const v = r[df];
      if (!v) return false;
      const t = new Date(v).getTime();
      return t >= fromTs && t <= toTs;
    });
  }

  // --- Filtres génériques (eq/neq/gt/lt/…) ---
  for (const f of q.filters) {
    if (!f.field || (f.value === undefined && f.operator !== "isnull")) continue;
    rows = rows.filter((r) => matchOp(r[f.field], f.operator, f.value));
  }

  const total = rows.length;

  // --- Aggregation sans groupBy ---
  if (!q.groupBy) {
    const value = computeAggInMemory(q.aggregate, rows, q.aggregateField, total);
    return {
      results: [{ label: "Total", value }],
      total,
      aggregate: q.aggregate,
    };
  }

  // --- GroupBy (avec éventuel bucket de date _by_day/_by_month/…) ---
  const bucket = detectBucket(q.groupBy);
  const baseField = bucket?.base ?? q.groupBy;

  const groups = new Map<string, { count: number; values: number[] }>();
  for (const r of rows) {
    let label: string;
    if (bucket) {
      const d = r[baseField];
      if (!d) continue;
      label = dateBucketLabel(new Date(d), bucket.suffix);
    } else {
      const raw = r[baseField];
      label = raw === true ? "Oui" : raw === false ? "Non"
        : raw instanceof Date ? raw.toISOString().slice(0, 10)
        : String(raw ?? "—");
    }
    const g = groups.get(label) ?? { count: 0, values: [] };
    g.count += 1;
    if (q.aggregateField && r[q.aggregateField] != null) g.values.push(Number(r[q.aggregateField]));
    groups.set(label, g);
  }

  let results = Array.from(groups.entries()).map(([label, g]) => ({
    label,
    value: computeAggFromGroup(q.aggregate, g.values, g.count, total),
  }));
  // Support des mêmes modes de tri que le handler Prisma : value, label,
  // chronological (parse les buckets date), none (ordre d'insertion).
  sortQboResults(results, q.sortBy, q.sortDir);
  if (q.limit > 0) results = results.slice(0, q.limit);

  return { results, total, groupedBy: q.groupBy, aggregate: q.aggregate };
}

function matchOp(cell: any, op: string, value: any): boolean {
  switch (op) {
    case "eq":       return cell == value;
    case "neq":      return cell != value;
    case "gt":       return Number(cell) > Number(value);
    case "lt":       return Number(cell) < Number(value);
    case "gte":      return Number(cell) >= Number(value);
    case "lte":      return Number(cell) <= Number(value);
    case "in": {
      const arr = Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim());
      return arr.includes(String(cell));
    }
    case "contains": return String(cell ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
    case "isnull":   return value === false ? cell != null : cell == null;
    case "between": {
      const [lo, hi] = Array.isArray(value) ? value : String(value).split(",");
      const n = Number(cell);
      return n >= Number(lo) && n <= Number(hi);
    }
    default: return true;
  }
}

function computeAggInMemory(aggregate: string, rows: any[], field: string | undefined, total: number): number {
  if (aggregate === "count") return rows.length;
  if (aggregate === "count_distinct") return new Set(rows.map((r) => r[field ?? "id"])).size;
  if (!field) return rows.length;
  const vals = rows.map((r) => Number(r[field])).filter((n) => Number.isFinite(n));
  if (aggregate === "sum") return round2(vals.reduce((s, v) => s + v, 0));
  if (aggregate === "avg") return vals.length ? round2(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  if (aggregate === "min") return vals.length ? Math.min(...vals) : 0;
  if (aggregate === "max") return vals.length ? Math.max(...vals) : 0;
  if (aggregate === "median") {
    if (vals.length === 0) return 0;
    const s = [...vals].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? round2((s[m - 1] + s[m]) / 2) : s[m];
  }
  if (aggregate === "percentage") return total > 0 ? round2((rows.length / total) * 100) : 0;
  return rows.length;
}

function computeAggFromGroup(aggregate: string, values: number[], count: number, total: number): number {
  if (aggregate === "count") return count;
  if (aggregate === "count_distinct") return new Set(values).size;
  if (aggregate === "sum") return round2(values.reduce((s, v) => s + v, 0));
  if (aggregate === "avg") return values.length ? round2(values.reduce((s, v) => s + v, 0) / values.length) : 0;
  if (aggregate === "min") return values.length ? Math.min(...values) : 0;
  if (aggregate === "max") return values.length ? Math.max(...values) : 0;
  if (aggregate === "median") {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? round2((s[m - 1] + s[m]) / 2) : s[m];
  }
  if (aggregate === "percentage") return total > 0 ? round2((count / total) * 100) : 0;
  return count;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBucketLabelToTs(label: string): number | null {
  if (/^\d{4}$/.test(label)) return Date.UTC(Number(label), 0, 1);
  const d = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) return Date.UTC(+d[1], +d[2] - 1, +d[3]);
  const m = label.match(/^(\d{4})-(\d{2})$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, 1);
  const w = label.match(/^(\d{4})-S(\d{2})$/);
  if (w) return Date.UTC(+w[1], 0, 1) + (+w[2] - 1) * 7 * 86_400_000;
  const q = label.match(/^(\d{4})-T(\d)$/);
  if (q) return Date.UTC(+q[1], (+q[2] - 1) * 3, 1);
  return null;
}

function sortQboResults(
  results: Array<{ label: string; value: number }>,
  sortBy: string,
  sortDir: string,
): void {
  if (sortBy === "none") return;
  if (sortBy === "label") {
    results.sort((a, b) => sortDir === "asc"
      ? a.label.localeCompare(b.label)
      : b.label.localeCompare(a.label));
    return;
  }
  if (sortBy === "chronological") {
    results.sort((a, b) => {
      const ta = parseBucketLabelToTs(a.label);
      const tb = parseBucketLabelToTs(b.label);
      if (ta == null || tb == null) return a.label.localeCompare(b.label);
      return sortDir === "desc" ? tb - ta : ta - tb;
    });
    return;
  }
  results.sort((a, b) => sortDir === "asc" ? a.value - b.value : b.value - a.value);
}

type BucketSuffix = "_by_day" | "_by_week" | "_by_month" | "_by_quarter" | "_by_year";
function detectBucket(field: string): { base: string; suffix: BucketSuffix } | null {
  const sufs: BucketSuffix[] = ["_by_day", "_by_week", "_by_month", "_by_quarter", "_by_year"];
  for (const s of sufs) if (field.endsWith(s)) return { base: field.slice(0, -s.length), suffix: s };
  return null;
}
function dateBucketLabel(d: Date, b: BucketSuffix): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  if (b === "_by_day") return `${y}-${m}-${dd}`;
  if (b === "_by_week") {
    const jan1 = new Date(y, 0, 1);
    const wk = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
    return `${y}-S${String(wk).padStart(2, "0")}`;
  }
  if (b === "_by_month") return `${y}-${m}`;
  if (b === "_by_quarter") return `${y}-T${Math.ceil((d.getMonth() + 1) / 3)}`;
  return `${y}`;
}
