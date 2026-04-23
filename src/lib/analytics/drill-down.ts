// ============================================================================
// Drill-down : traduit un clic sur un point de données (barre, part de pie,
// etc.) en URL vers la liste d'entrées correspondantes.
//
// Stratégie : chaque dataset a une page liste cible avec une clé de param
// par groupBy-field. Best-effort — si la page cible n'interprète pas le
// param, elle ignore gracefully.
// ============================================================================

export interface DrillDownInput {
  dataset: string;
  groupBy: string; // ex: "status", "priority", "organizationId", "createdAt_by_month"
  rawLabel: string; // valeur brute du label (ex: "RESOLVED", "HIGH", "2026-04")
  /** Filtres déjà appliqués au widget — propagés dans l'URL de drill-down. */
  existingFilters?: Array<{ field: string; operator?: string; value: string }>;
}

/** Préfixe la groupBy base (retire les suffixes _by_day/_month/_year). */
function stripBucketSuffix(groupBy: string): { base: string; bucket: string | null } {
  const m = groupBy.match(/^(.+)_by_(day|week|month|quarter|year)$/);
  if (m) return { base: m[1], bucket: m[2] };
  return { base: groupBy, bucket: null };
}

/** Base URL pour chaque dataset (page de liste correspondante). */
const DATASET_LIST_URL: Record<string, string> = {
  tickets: "/tickets",
  time_entries: "/billing",
  contacts: "/contacts",
  organizations: "/organisations",
  contracts: "/contracts",
  assets: "/assets",
  projects: "/projects",
  expense_reports: "/finances",
  purchase_orders: "/finances",
  monitoring_alerts: "/tickets",
  security_alerts: "/security-center/incidents",
  calendar_events: "/calendar",
  qbo_invoices: "/finances",
  qbo_customers: "/finances",
  qbo_payments: "/finances",
  qbo_expenses: "/finances",
};

/**
 * Clé de param URL pour chaque couple (dataset, groupBy). Les listes de
 * tickets acceptent status/priority/assigneeId/etc. Les autres datasets
 * ont leurs propres conventions.
 */
const PARAM_MAP: Record<string, Record<string, string>> = {
  tickets: {
    status: "status",
    priority: "priority",
    type: "type",
    urgency: "urgency",
    impact: "impact",
    source: "source",
    organizationId: "organizationId",
    assigneeId: "assigneeId",
    creatorId: "creatorId",
    categoryId: "categoryId",
    categoryBaseId: "categoryId",
    queueId: "queueId",
    projectId: "projectId",
    siteId: "siteId",
    requesterId: "requesterId",
    monitoringStage: "monitoringStage",
    approvalStatus: "approvalStatus",
    prioritySource: "prioritySource",
    categorySource: "categorySource",
  },
  time_entries: {
    organizationId: "orgId",
    agentId: "agentId",
    ticketId: "ticketId",
    coverageStatus: "coverage",
    timeType: "timeType",
    approvalStatus: "approval",
  },
  contacts: {
    organizationId: "organizationId",
    siteId: "siteId",
  },
  contracts: { organizationId: "organizationId", status: "status", type: "type" },
  assets: { organizationId: "organizationId", siteId: "siteId", status: "status" },
  projects: { organizationId: "organizationId", status: "status", managerId: "managerId" },
  security_alerts: { organizationId: "organizationId", severity: "severity", status: "status" },
  calendar_events: { organizationId: "organizationId", type: "type", siteId: "siteId" },
};

/**
 * Construit l'URL de drill-down pour un click sur un point de données.
 * Retourne null si aucune cible n'est configurée (dataset inconnu, groupBy
 * non mappable) — le caller peut alors afficher un toast "no drill".
 */
export function buildDrillDownUrl(input: DrillDownInput): string | null {
  const base = DATASET_LIST_URL[input.dataset];
  if (!base) return null;

  const { base: groupByBase, bucket } = stripBucketSuffix(input.groupBy);
  const paramKey = PARAM_MAP[input.dataset]?.[groupByBase];

  const sp = new URLSearchParams();

  // Propage les filtres existants (equality seulement).
  if (input.existingFilters) {
    for (const f of input.existingFilters) {
      if (!f.field || f.value == null || f.value === "") continue;
      const k = PARAM_MAP[input.dataset]?.[f.field];
      if (k && (!f.operator || f.operator === "eq")) {
        sp.set(k, String(f.value));
      }
    }
  }

  // Applique le filtre du point cliqué.
  if (paramKey && input.rawLabel) {
    // Cas spécial : groupBy date bucket → on envoie from+to approximatifs.
    if (bucket) {
      const range = bucketLabelToRange(input.rawLabel, bucket);
      if (range) {
        sp.set("from", range.from);
        sp.set("to", range.to);
      }
    } else {
      sp.set(paramKey, input.rawLabel);
    }
  }

  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Décode un label de bucket temporel ("2026-04", "2026-W14", "2026-Q2",
 * "2026") en plage ISO [from, to]. Retourne null si non-reconnu.
 */
function bucketLabelToRange(label: string, bucket: string): { from: string; to: string } | null {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (bucket === "year" && /^\d{4}$/.test(label)) {
    const y = parseInt(label, 10);
    return { from: fmt(new Date(y, 0, 1)), to: fmt(new Date(y, 11, 31)) };
  }
  if (bucket === "month" && /^\d{4}-\d{2}$/.test(label)) {
    const [y, m] = label.split("-").map((x) => parseInt(x, 10));
    return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
  }
  if (bucket === "quarter") {
    const m = label.match(/^(\d{4})-(?:Q|T)(\d)$/);
    if (m) {
      const [, y, q] = m;
      const year = parseInt(y, 10);
      const qNum = parseInt(q, 10);
      const startMonth = (qNum - 1) * 3;
      return { from: fmt(new Date(year, startMonth, 1)), to: fmt(new Date(year, startMonth + 3, 0)) };
    }
  }
  if (bucket === "week") {
    const m = label.match(/^(\d{4})-(?:S|W)(\d{1,2})$/);
    if (m) {
      const [, y, w] = m;
      // ISO week approximatif — suffisant pour un filtre de range.
      const year = parseInt(y, 10);
      const week = parseInt(w, 10);
      const simple = new Date(year, 0, 1 + (week - 1) * 7);
      const start = new Date(simple);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: fmt(start), to: fmt(end) };
    }
  }
  if (bucket === "day" && /^\d{4}-\d{2}-\d{2}/.test(label)) {
    const d = label.slice(0, 10);
    return { from: d, to: d };
  }
  return null;
}
