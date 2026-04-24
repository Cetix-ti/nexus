/**
 * Portal ticket status configuration.
 *
 * This is the SINGLE SOURCE OF TRUTH for how Prisma TicketStatus values
 * are grouped and displayed in the client portal.
 *
 * If Kanban columns or DB statuses change, update THIS file only —
 * the portal dashboard, tabs, and filters all derive from it.
 */

// ── Individual status definitions ──────────────────────────────────────────

export interface PortalStatusDef {
  /** DB value (lowercase) matching Prisma TicketStatus */
  value: string;
  /** French label shown in the portal (fallback) */
  label: string;
  /** i18n key used by the portal to render a translated label */
  labelKey: string;
  /** Tailwind background class */
  bg: string;
  /** Tailwind text color class */
  text: string;
  /** Hex color for charts */
  color: string;
}

export const PORTAL_STATUSES: PortalStatusDef[] = [
  { value: "new",              label: "Nouveau",              labelKey: "portal.status.new",              bg: "bg-blue-50",    text: "text-blue-700",    color: "#3B82F6" },
  { value: "open",             label: "Ouvert",               labelKey: "portal.status.open",             bg: "bg-sky-50",     text: "text-sky-700",     color: "#0EA5E9" },
  { value: "in_progress",      label: "En cours",             labelKey: "portal.status.in_progress",      bg: "bg-amber-50",   text: "text-amber-700",   color: "#F59E0B" },
  { value: "on_site",          label: "Sur place",            labelKey: "portal.status.on_site",          bg: "bg-cyan-50",    text: "text-cyan-700",    color: "#06B6D4" },
  { value: "pending",          label: "En attente (interne)", labelKey: "portal.status.pending_internal", bg: "bg-purple-50",  text: "text-purple-700",  color: "#A855F7" },
  { value: "waiting_client",   label: "En attente",           labelKey: "portal.status.waiting_client",   bg: "bg-violet-50",  text: "text-violet-700",  color: "#8B5CF6" },
  { value: "waiting_vendor",   label: "Attente fournisseur",  labelKey: "portal.status.waiting_vendor",   bg: "bg-pink-50",    text: "text-pink-700",    color: "#EC4899" },
  { value: "scheduled",        label: "Planifié",             labelKey: "portal.status.scheduled",        bg: "bg-teal-50",    text: "text-teal-700",    color: "#14B8A6" },
  { value: "resolved",         label: "Résolu",               labelKey: "portal.status.resolved",         bg: "bg-emerald-50", text: "text-emerald-700", color: "#10B981" },
  { value: "closed",           label: "Fermé",                labelKey: "portal.status.closed",           bg: "bg-slate-100",  text: "text-slate-600",   color: "#94A3B8" },
  { value: "cancelled",        label: "Annulé",               labelKey: "portal.status.cancelled",        bg: "bg-slate-100",  text: "text-slate-500",   color: "#CBD5E1" },
];

/** Quick lookup by status value */
export const STATUS_MAP = Object.fromEntries(
  PORTAL_STATUSES.map((s) => [s.value, s]),
) as Record<string, PortalStatusDef>;

// ── Status groups (portal dashboard & tabs) ────────────────────────────────

export interface PortalStatusGroup {
  key: string;
  label: string;
  labelKey: string;
  /** Statuses that belong to this group (lowercase DB values) */
  statuses: string[];
  /** Accent color for the KPI card */
  color: string;
  /** Tailwind classes for KPI styling */
  bgClass: string;
  textClass: string;
  iconBgClass: string;
}

/**
 * Logical groups used in the portal dashboard KPI cards and tab filters.
 * "active" groups are the ones that matter to clients — their open work.
 */
export const PORTAL_STATUS_GROUPS: PortalStatusGroup[] = [
  {
    key: "open",
    label: "Ouverts",
    labelKey: "portal.tickets.group.open",
    statuses: ["new", "open"],
    color: "#3B82F6",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    iconBgClass: "bg-blue-100",
  },
  {
    key: "in_progress",
    label: "En traitement",
    labelKey: "portal.tickets.group.in_progress",
    statuses: ["in_progress", "on_site", "scheduled"],
    color: "#F59E0B",
    bgClass: "bg-amber-50",
    textClass: "text-amber-700",
    iconBgClass: "bg-amber-100",
  },
  {
    key: "waiting",
    label: "En attente",
    labelKey: "portal.tickets.group.waiting",
    statuses: ["pending", "waiting_client", "waiting_vendor"],
    color: "#8B5CF6",
    bgClass: "bg-violet-50",
    textClass: "text-violet-700",
    iconBgClass: "bg-violet-100",
  },
  {
    key: "resolved",
    label: "Résolus",
    labelKey: "portal.tickets.group.resolved",
    statuses: ["resolved", "closed", "cancelled"],
    color: "#10B981",
    bgClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    iconBgClass: "bg-emerald-100",
  },
];

// ── Priority definitions ───────────────────────────────────────────────────

export interface PortalPriorityDef {
  value: string;
  label: string;
  labelKey: string;
  color: string;
  bgClass: string;
  textClass: string;
}

export const PORTAL_PRIORITIES: PortalPriorityDef[] = [
  { value: "critical", label: "Critique", labelKey: "portal.priority.critical", color: "#EF4444", bgClass: "bg-red-50",    textClass: "text-red-700" },
  { value: "high",     label: "Élevée",   labelKey: "portal.priority.high",     color: "#F97316", bgClass: "bg-orange-50", textClass: "text-orange-700" },
  { value: "medium",   label: "Moyenne",  labelKey: "portal.priority.medium",   color: "#3B82F6", bgClass: "bg-blue-50",   textClass: "text-blue-700" },
  { value: "low",      label: "Faible",   labelKey: "portal.priority.low",      color: "#10B981", bgClass: "bg-emerald-50",textClass: "text-emerald-700" },
];

export const PRIORITY_MAP = Object.fromEntries(
  PORTAL_PRIORITIES.map((p) => [p.value, p]),
) as Record<string, PortalPriorityDef>;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Find which group a status belongs to */
export function getGroupForStatus(status: string): PortalStatusGroup | undefined {
  return PORTAL_STATUS_GROUPS.find((g) => g.statuses.includes(status));
}

/** Get the French label for a status */
export function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

/** Get the French label for a priority */
export function getPriorityLabel(priority: string): string {
  return PRIORITY_MAP[priority]?.label ?? priority;
}
