"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TagOrganizationModal } from "@/components/analytics/tag-organization-modal";
import { ManageTagsModal, AssignTagsModal } from "@/components/analytics/dashboard-tag-modals";
import {
  type TagDef,
  loadTagDefinitions,
  saveTagDefinitions,
  tagStyle,
} from "@/lib/analytics/dashboard-tags";
import { DashboardGrid, type DashboardItem } from "@/components/widgets/dashboard-grid";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Ticket,
  Building2,
  Users,
  Loader2,
  AlertTriangle,
  LayoutDashboard,
  List,
  Eye,
  EyeOff,
  ChevronRight,
  ArrowLeft,
  DollarSign,
  PieChart,
  MapPin,
  Moon,
  BarChart3,
  Receipt,
  FileText,
  Timer,
  ExternalLink,
  Filter,
  Printer,
  X,
  Plus,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Share2,
  Undo2,
  Redo2,
  Save,
  Folder,
  FolderPlus,
  Pencil,
  ChevronDown,
  MoreHorizontal,
  Copy,
  Tag as TagIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  PieChart as RePieChart, Pie, Cell,
  Tooltip as ReTooltip,
  XAxis, YAxis, CartesianGrid,
} from "recharts";
import { WidgetChart, type ChartType } from "@/components/widgets/widget-chart";
import { WorkOrdersListWidget } from "@/components/widgets/work-orders-list-widget";
import { buildDrillDownUrl } from "@/lib/analytics/drill-down";
import { ExportDashboardButton } from "@/components/analytics/export-dashboard-button";
import { AnalyticsSectionTabs } from "@/components/analytics/section-tabs";
import { DashboardItemAppearance } from "@/components/analytics/dashboard-item-appearance";
import {
  WidgetCatalogPicker,
  renderAddAction,
  renderToggleAction,
  type UnifiedWidget,
} from "@/components/analytics/widget-catalog-picker";
import {
  loadWidgetMeta,
  saveWidgetMeta,
  updateWidgetMeta,
  type WidgetMetaStore,
} from "@/lib/analytics/widget-meta";

const PIE_PALETTE = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];
function pickPieColors(baseColor: string, count: number): string[] {
  const palette = [baseColor, ...PIE_PALETTE];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}
import { cn } from "@/lib/utils";
import { remapBaseCategoryResults } from "@/lib/analytics/base-category-remap";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ===========================================================================
// Types
// ===========================================================================
interface TicketKpis {
  totalTickets: number;
  createdInPeriod: number;
  resolvedInPeriod: number;
  openTickets: number;
  slaBreached: number;
  slaCompliance: number;
  avgResolutionHours: number | null;
}

interface FinanceKpis {
  totalRevenue: number;
  prevRevenue: number;
  revenueTrend: number;
  totalHours: number;
  prevHours: number;
  billableHours: number;
  billableRate: number;
  avgHourlyRate: number;
  onsiteHours: number;
  afterHoursHours: number;
  onsiteRevenue: number;
  afterHoursRevenue: number;
  projectedMonthlyRevenue: number;
  monthlyContractValue: number;
  activeContractsCount: number;
}

interface MonthlyRow { month: string; hours: number; revenue: number; billableHours: number; billableRate: number }
interface AgentRow { agentName: string; avatar: string | null; hours: number; revenue: number; entries: number; resolved: number }
interface CoverageRow { status: string; hours: number; revenue: number; count: number }
interface OrgRevenueRow { organizationId: string; organizationName: string; revenue: number; hours: number }
interface TopTicketRow { ticketNumber: number; subject: string; status: string; organizationName: string; hours: number; revenue: number }
interface ContractUsageRow { id: string; name: string; organizationName: string; type: string; monthlyHours: number; usedHours: number; remainingHours: number; usagePercent: number; hourlyRate: number }

interface ReportData {
  period: { days: number; since: string };
  ticketKpis: TicketKpis;
  financeKpis: FinanceKpis;
  ticketStats: {
    byStatus: { status: string; count: number }[];
    byPriority: { priority: string; count: number }[];
    byType: { type: string; count: number }[];
    byOrg: { organizationId: string; organizationName: string; count: number }[];
  };
  monthlyBreakdown: MonthlyRow[];
  agentBreakdown: AgentRow[];
  coverageBreakdown: CoverageRow[];
  revenueByOrg: OrgRevenueRow[];
  topTickets: TopTicketRow[];
  contractUsage: ContractUsageRow[];
}

// ===========================================================================
// Widget definitions
// ===========================================================================
type WidgetId =
  | "ticket_kpis"
  | "finance_kpis"
  | "monthly_trend"
  | "tickets_status"
  | "tickets_priority"
  | "tickets_type"
  | "tickets_org"
  | "agent_performance"
  | "coverage_breakdown"
  | "revenue_by_org"
  | "contract_usage"
  | "top_tickets"
  | "projection"
  | "work_orders";

interface WidgetDef {
  id: WidgetId;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "tickets" | "facturation" | "performance" | "contrats";
}

const WIDGETS: WidgetDef[] = [
  { id: "ticket_kpis", label: "KPIs Tickets", description: "Créés, résolus, ouverts, SLA, conformité", icon: <Ticket className="h-4 w-4" />, category: "tickets" },
  { id: "finance_kpis", label: "KPIs Financiers", description: "Revenus, heures, taux facturable, taux horaire", icon: <DollarSign className="h-4 w-4" />, category: "facturation" },
  { id: "projection", label: "Projection mensuelle", description: "Revenus projetés et valeur des contrats récurrents", icon: <TrendingUp className="h-4 w-4" />, category: "facturation" },
  { id: "monthly_trend", label: "Tendance mensuelle", description: "Graphique heures et revenus sur 12 mois", icon: <BarChart3 className="h-4 w-4" />, category: "facturation" },
  { id: "tickets_status", label: "Tickets par statut", description: "Distribution nouveau, ouvert, en cours, résolu", icon: <Ticket className="h-4 w-4" />, category: "tickets" },
  { id: "tickets_priority", label: "Tickets par priorité", description: "Distribution critique, haute, moyenne, basse", icon: <AlertTriangle className="h-4 w-4" />, category: "tickets" },
  { id: "tickets_type", label: "Tickets par type", description: "Incidents, demandes, problèmes, changements", icon: <FileText className="h-4 w-4" />, category: "tickets" },
  { id: "tickets_org", label: "Tickets par client", description: "Top 15 organisations par volume de tickets", icon: <Building2 className="h-4 w-4" />, category: "tickets" },
  { id: "agent_performance", label: "Performance techniciens", description: "Heures, revenus, tickets résolus par agent", icon: <Users className="h-4 w-4" />, category: "performance" },
  { id: "coverage_breakdown", label: "Répartition couverture", description: "Facturable, inclus, banque d'heures, non-facturable", icon: <Receipt className="h-4 w-4" />, category: "facturation" },
  { id: "revenue_by_org", label: "Revenus par client", description: "Top 15 organisations par revenus générés", icon: <Building2 className="h-4 w-4" />, category: "facturation" },
  { id: "contract_usage", label: "Utilisation contrats", description: "Heures utilisées vs allouées par contrat actif", icon: <FileText className="h-4 w-4" />, category: "contrats" },
  { id: "top_tickets", label: "Top tickets par temps", description: "Les 10 tickets avec le plus de temps investi", icon: <Clock className="h-4 w-4" />, category: "performance" },
  { id: "work_orders", label: "Bons de travail", description: "Liste détaillée des saisies de temps (description, ticket, durée, montant) avec export CSV/PDF", icon: <FileText className="h-4 w-4" />, category: "facturation" },
];

const DEFAULT_DASHBOARD: WidgetId[] = [
  "ticket_kpis", "finance_kpis", "projection", "monthly_trend",
  "tickets_status", "tickets_priority", "agent_performance", "revenue_by_org",
];

// ===========================================================================
// Report catalog
// ===========================================================================
interface ReportDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "tickets" | "facturation" | "performance" | "contrats" | "complet";
  widgets: WidgetId[];
  parentId?: string | null;
  /**
   * Liste des organisations auxquelles ce rapport est attribué. Vide ou
   * absent = global (visible partout). Un rapport peut être attribué à
   * plusieurs organisations à la fois — il apparaît alors dans l'onglet
   * Rapports de chacune et dans /analytics/dashboards?orgContext=<orgId>
   * pour chacune.
   */
  organizationIds?: string[];
  /**
   * @deprecated — ancien champ single-org. Lu pour rétrocompat, migré
   * automatiquement vers `organizationIds` au prochain save.
   */
  organizationId?: string;
  /**
   * Liste d'IDs de balises (TagDef) attachées au rapport. Les définitions
   * des balises (nom, couleur) sont stockées séparément pour qu'elles
   * puissent être éditées globalement sans toucher à chaque rapport.
   */
  tags?: string[];
}

/** Retourne la liste normalisée d'orgIds attribuées à un rapport. */
function getReportOrgs(r: ReportDef): string[] {
  const arr = Array.isArray(r.organizationIds) ? r.organizationIds : [];
  // Rétrocompat : si legacy organizationId présent, l'inclure (sans doublon).
  if (r.organizationId && !arr.includes(r.organizationId)) return [...arr, r.organizationId];
  return arr;
}

// Accent couleur par catégorie — utilisé pour la bande verticale, le
// fond de l'icône et le badge catégorie des cartes de galerie. Donne
// un repère visuel pour scanner rapidement la galerie.
const CATEGORY_ACCENT: Record<string, { bar: string; bg: string; fg: string; ring: string }> = {
  tickets:     { bar: "#3B82F6", bg: "#EFF6FF", fg: "#1D4ED8", ring: "rgba(59,130,246,0.18)" },
  facturation: { bar: "#10B981", bg: "#ECFDF5", fg: "#047857", ring: "rgba(16,185,129,0.18)" },
  performance: { bar: "#F59E0B", bg: "#FFFBEB", fg: "#B45309", ring: "rgba(245,158,11,0.18)" },
  contrats:    { bar: "#8B5CF6", bg: "#F5F3FF", fg: "#6D28D9", ring: "rgba(139,92,246,0.18)" },
  complet:     { bar: "#64748B", bg: "#F8FAFC", fg: "#334155", ring: "rgba(100,116,139,0.18)" },
};

const REPORT_CATALOG: ReportDef[] = [
  {
    id: "monthly_billing",
    label: "Rapport mensuel de facturation",
    description: "Sommaire complet des heures et revenus pour le mois avec répartition par client et couverture",
    icon: <DollarSign className="h-5 w-5 text-emerald-600" />,
    category: "facturation",
    widgets: ["finance_kpis", "projection", "monthly_trend", "coverage_breakdown", "revenue_by_org", "contract_usage"],
  },
  {
    id: "ticket_overview",
    label: "Vue d'ensemble des tickets",
    description: "Analyse complète de l'activité tickets : volume, distribution, SLA et tendances",
    icon: <Ticket className="h-5 w-5 text-blue-600" />,
    category: "tickets",
    widgets: ["ticket_kpis", "tickets_status", "tickets_priority", "tickets_type", "tickets_org"],
  },
  {
    id: "agent_review",
    label: "Revue de performance des techniciens",
    description: "Comparaison des heures, revenus et tickets résolus par technicien",
    icon: <Users className="h-5 w-5 text-violet-600" />,
    category: "performance",
    widgets: ["agent_performance", "top_tickets", "finance_kpis"],
  },
  {
    id: "profitability",
    label: "Analyse de rentabilité",
    description: "Taux facturable, taux horaire moyen, revenus par client et tendance mensuelle",
    icon: <TrendingUp className="h-5 w-5 text-amber-600" />,
    category: "facturation",
    widgets: ["finance_kpis", "monthly_trend", "coverage_breakdown", "revenue_by_org", "agent_performance"],
  },
  {
    id: "sla_compliance",
    label: "Conformité SLA",
    description: "Tickets SLA dépassés, conformité globale, temps de résolution et top tickets",
    icon: <ShieldCheck className="h-5 w-5 text-red-600" />,
    category: "tickets",
    widgets: ["ticket_kpis", "tickets_priority", "tickets_org", "top_tickets"],
  },
  {
    id: "contract_review",
    label: "Revue des contrats",
    description: "Utilisation des heures par contrat, dépassements, couverture et valeur récurrente",
    icon: <FileText className="h-5 w-5 text-cyan-600" />,
    category: "contrats",
    widgets: ["contract_usage", "coverage_breakdown", "finance_kpis", "projection"],
  },
  {
    id: "client_ranking",
    label: "Classement des clients",
    description: "Clients classés par revenus, volume de tickets et heures consommées",
    icon: <Building2 className="h-5 w-5 text-indigo-600" />,
    category: "facturation",
    widgets: ["revenue_by_org", "tickets_org", "finance_kpis"],
  },
  {
    id: "quickbooks_report",
    label: "Rapport QuickBooks",
    description: "Comptes à recevoir, revenus par client, vieillissement des factures, P&L et bilan",
    icon: <DollarSign className="h-5 w-5 text-green-600" />,
    category: "facturation",
    widgets: ["finance_kpis", "revenue_by_org"],
  },
  {
    id: "full_report",
    label: "Rapport complet",
    description: "Tous les indicateurs et graphiques combinés en un seul rapport exhaustif",
    icon: <BarChart3 className="h-5 w-5 text-slate-600" />,
    category: "complet",
    widgets: ["ticket_kpis", "finance_kpis", "projection", "monthly_trend", "tickets_status", "tickets_priority", "tickets_type", "tickets_org", "agent_performance", "coverage_breakdown", "revenue_by_org", "contract_usage", "top_tickets"],
  },
];

const CAT_LABELS: Record<string, string> = {
  tickets: "Tickets & SLA",
  facturation: "Facturation & Revenus",
  performance: "Performance",
  contrats: "Contrats",
  complet: "Complet",
};

// ===========================================================================
// Labels / Colors
// ===========================================================================
const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau", OPEN: "Ouvert", IN_PROGRESS: "En cours", ON_SITE: "Sur place",
  WAITING_CLIENT: "En attente", SCHEDULED: "Planifié", RESOLVED: "Résolu", CLOSED: "Fermé",
};
const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-500", OPEN: "bg-sky-500", IN_PROGRESS: "bg-amber-500", ON_SITE: "bg-cyan-500",
  WAITING_CLIENT: "bg-violet-500", RESOLVED: "bg-emerald-500", CLOSED: "bg-slate-400", SCHEDULED: "bg-indigo-500",
};
const PRIORITY_LABELS: Record<string, string> = { CRITICAL: "Critique", HIGH: "Élevée", MEDIUM: "Moyenne", LOW: "Faible" };
const PRIORITY_COLORS: Record<string, string> = { CRITICAL: "bg-red-500", HIGH: "bg-orange-500", MEDIUM: "bg-amber-500", LOW: "bg-emerald-500" };
const TYPE_LABELS: Record<string, string> = { INCIDENT: "Incident", REQUEST: "Demande", PROBLEM: "Problème", CHANGE: "Changement" };
const COVERAGE_LABELS: Record<string, string> = {
  billable: "Facturable", included_in_contract: "Inclus contrat", hour_bank: "Banque d'heures",
  hour_bank_overage: "Dépassement banque", msp_overage: "Hors forfait", non_billable: "Non facturable",
  pending: "En attente", travel_billable: "Déplacement facturable",
};
const COVERAGE_COLORS: Record<string, string> = {
  billable: "bg-emerald-500", included_in_contract: "bg-blue-500", hour_bank: "bg-violet-500",
  hour_bank_overage: "bg-amber-500", msp_overage: "bg-orange-500", non_billable: "bg-slate-400",
  pending: "bg-slate-300", travel_billable: "bg-cyan-500",
};
const MONTH_NAMES = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

function fmtMoney(v: number) { return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }); }
function fmtHours(h: number) { return `${h.toLocaleString("fr-CA", { maximumFractionDigits: 1 })}h`; }
function monthLabel(key: string) { const [, m] = key.split("-"); return MONTH_NAMES[parseInt(m, 10) - 1] || key; }

const STORAGE_KEY = "nexus:reports:widgets";
function loadVisible(): WidgetId[] { try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {} return DEFAULT_DASHBOARD; }
function saveVisible(ids: WidgetId[]) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch {} }

// ===========================================================================
// Main Page
// ===========================================================================
// Persistence
const FAV_KEY = "nexus:reports:favorites";
const PRIMARY_KEY = "nexus:reports:primary";
const CUSTOM_REPORTS_KEY = "nexus:reports:custom";
const FOLDERS_KEY = "nexus:reports:folders";
const RECENT_KEY = "nexus:reports:recent";
const COLLAPSED_SECTIONS_KEY = "nexus:reports:sidebar-collapsed-sections";
const MAX_RECENT = 5;

// Une "Folder" regroupe des dashboards par l'utilisateur. Les folders sont
// purement une organisation visuelle côté client — ils ne changent pas le
// catalogue. Le même dashboard peut être dans 0, 1 ou plusieurs folders.
interface DashboardFolder {
  id: string;
  name: string;
  dashboardIds: string[];
  createdAt: string;
}

function loadFavorites(): string[] { try { const r = localStorage.getItem(FAV_KEY); if (r) return JSON.parse(r); } catch {} return ["full_report", "monthly_billing", "ticket_overview"]; }
function saveFavorites(ids: string[]) { try { localStorage.setItem(FAV_KEY, JSON.stringify(ids)); } catch {} }
function loadPrimary(): string { try { return localStorage.getItem(PRIMARY_KEY) || "full_report"; } catch { return "full_report"; } }
function savePrimary(id: string) { try { localStorage.setItem(PRIMARY_KEY, id); } catch {} }
function loadCustomReports(): ReportDef[] { try { const r = localStorage.getItem(CUSTOM_REPORTS_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveCustomReports(reports: ReportDef[]) {
  try { localStorage.setItem(CUSTOM_REPORTS_KEY, JSON.stringify(reports)); } catch {}
  // Phase 5 — sync DB en arrière-plan. Le localStorage reste comme
  // cache rapide pour l'affichage initial avant que la GET API revienne.
  if (typeof window !== "undefined") {
    const payload = reports.map((r) => ({
      id: r.id,
      label: r.label,
      description: r.description,
      category: r.category,
      widgets: r.widgets,
      organizationIds: r.organizationIds ?? [],
      tags: r.tags ?? [],
      parentId: r.parentId ?? null,
    }));
    fetch("/api/v1/me/dashboards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reports: payload }),
    }).catch(() => {});
  }
}

// Set des IDs de dashboards built-in (REPORT_CATALOG) que l'user a
// choisi de masquer. Persisté en localStorage ; restaurables via le
// panneau Filtres (bouton "Afficher les masqués").
const HIDDEN_BUILTINS_KEY = "nexus:reports:hidden-builtins";
function loadHiddenBuiltins(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_BUILTINS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch { return new Set(); }
}
function saveHiddenBuiltins(set: Set<string>) {
  try { localStorage.setItem(HIDDEN_BUILTINS_KEY, JSON.stringify(Array.from(set))); } catch {}
}
function loadFolders(): DashboardFolder[] { try { const r = localStorage.getItem(FOLDERS_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveFolders(folders: DashboardFolder[]) { try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)); } catch {} }
function loadRecent(): string[] { try { const r = localStorage.getItem(RECENT_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveRecent(ids: string[]) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); } catch {} }

// Filtres persistés par dashboard — pour qu'ils soient conservés entre
// sessions et restitués automatiquement à l'ouverture d'un dashboard.
interface PersistedFilters {
  filterOrg: string;
  filterAgent: string;
  days: string;
  customFrom: string;
  customTo: string;
}
const DEFAULT_FILTERS: PersistedFilters = {
  filterOrg: "all", filterAgent: "all", days: "30", customFrom: "", customTo: "",
};
function loadReportFilters(reportId: string): PersistedFilters | null {
  try {
    const r = localStorage.getItem(`nexus:report-filters:${reportId}`);
    if (r) {
      const parsed = JSON.parse(r);
      if (parsed && typeof parsed === "object") {
        return {
          filterOrg: typeof parsed.filterOrg === "string" ? parsed.filterOrg : "all",
          filterAgent: typeof parsed.filterAgent === "string" ? parsed.filterAgent : "all",
          days: typeof parsed.days === "string" ? parsed.days : "30",
          customFrom: typeof parsed.customFrom === "string" ? parsed.customFrom : "",
          customTo: typeof parsed.customTo === "string" ? parsed.customTo : "",
        };
      }
    }
  } catch {}
  return null;
}
function saveReportFilters(reportId: string, f: PersistedFilters) {
  try { localStorage.setItem(`nexus:report-filters:${reportId}`, JSON.stringify(f)); } catch {}
}
function isDashboardView(view: string): boolean {
  // Les "pseudo-views" (galerie, favoris, récents, tous, dossier) commencent
  // par "__". Tout le reste est un reportId réel (built-in ou custom).
  return !view.startsWith("__");
}
function loadCollapsedSections(): Record<string, boolean> { try { const r = localStorage.getItem(COLLAPSED_SECTIONS_KEY); if (r) return JSON.parse(r); } catch {} return {}; }
function saveCollapsedSections(s: Record<string, boolean>) { try { localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(s)); } catch {} }

// Valeur sentinelle pour la vue galerie (par défaut au landing). Évite un
// conflit avec un ID de rapport réel — commencer par "__" c'est safe.
const GALLERY_VIEW = "__gallery__";
// Vues "galerie filtrée" : clic sur le titre d'une section de la sidebar.
// La flèche continue d'expand/collapse inline ; le titre ouvre la galerie.
const FAV_VIEW = "__fav__";
const RECENT_VIEW = "__recent__";
const ALL_VIEW = "__all__";
const FOLDER_VIEW_PREFIX = "__folder__:";
const isFolderView = (v: string) => v.startsWith(FOLDER_VIEW_PREFIX);
const folderViewId = (v: string) => (isFolderView(v) ? v.slice(FOLDER_VIEW_PREFIX.length) : null);
const isSectionGallery = (v: string) =>
  v === GALLERY_VIEW || v === FAV_VIEW || v === RECENT_VIEW || v === ALL_VIEW || isFolderView(v);

export default function ReportsPage() {
  // Contexte organisation : ?orgContext=<orgId> filtre les rapports custom
  // à cette org + tag les nouveaux rapports créés ici.
  const searchParams = useSearchParams();
  const orgContextId = searchParams?.get("orgContext") ?? null;
  const orgContextName = searchParams?.get("orgName") ?? null;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  // Page par défaut = galerie de dashboards (liste visuelle).
  // L'utilisateur peut ensuite pinner un dashboard en favori avec "défaut"
  // mais le landing reste la galerie pour plus de clarté.
  //
  // La vue est synchronisée avec l'URL (query param `?view=...`) pour que :
  //   - Le bouton « Précédent » du navigateur revienne à la galerie, pas
  //     à la page précédente avant /analytics/dashboards (ex : onglet
  //     Rapports programmés).
  //   - Un rechargement/partage d'URL conserve le dashboard ouvert.
  const [view, setViewState] = useState<string>(() => {
    if (typeof window === "undefined") return GALLERY_VIEW;
    const v = new URLSearchParams(window.location.search).get("view");
    return v || GALLERY_VIEW;
  });
  // Wrapper qui met à jour l'état ET pousse une entrée dans l'historique
  // en préservant les autres query params (orgContext, orgName…).
  const setView = useCallback((next: string) => {
    setViewState(next);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (next === GALLERY_VIEW) params.delete("view");
    else params.set("view", next);
    const qs = params.toString();
    const url = `/analytics/dashboards${qs ? `?${qs}` : ""}`;
    // Ne push que si l'URL change réellement — évite de polluer l'historique.
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, "", url);
    }
  }, []);
  // popstate : re-sync l'état interne quand l'user clique sur Précédent/
  // Suivant. Lit le param depuis l'URL courante et met à jour `view`.
  useEffect(() => {
    function onPop() {
      const v = new URLSearchParams(window.location.search).get("view");
      setViewState(v || GALLERY_VIEW);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [showConfig, setShowConfig] = useState(false);
  const [showWidgetSidebar, setShowWidgetSidebar] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(() => loadVisible());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [hiddenBuiltins, setHiddenBuiltins] = useState<Set<string>>(() => loadHiddenBuiltins());
  // Toggle dans le panneau Filtres — quand true, on affiche aussi les
  // dashboards built-in masqués pour permettre la restauration.
  const [showHidden, setShowHidden] = useState(false);
  // Range personnalisé — ISO dates (YYYY-MM-DD). Quand `days` === "custom",
  // la période effective est calculée à partir de ces deux champs.
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [primaryId, setPrimaryId] = useState<string>(() => loadPrimary());
  const [editMode, setEditMode] = useState(false);
  // Historique pour undo/redo (style Office) en mode édition.
  // Structure : chaque entrée = snapshot immutable de dashItems.
  //   - `editHistory` : états passés, le dernier = juste avant la modif courante
  //   - `editFuture`  : états défaits, remis dans dashItems via redo
  //   - `editBaseline` : snapshot pris à l'entrée en édition → utilisé par
  //     "Annuler" pour tout revert d'un coup.
  //   - Outside edit mode : le système se comporte comme avant (autosave
  //     direct dans localStorage sur chaque changement).
  const [editHistory, setEditHistory] = useState<DashboardItem[][]>([]);
  const [editFuture, setEditFuture] = useState<DashboardItem[][]>([]);
  const [editBaseline, setEditBaseline] = useState<DashboardItem[] | null>(null);
  const [customReports, setCustomReports] = useState<ReportDef[]>(() => loadCustomReports());
  // Phase 5 — sync DB au mount. Si DB a des données, c'est la source de
  // vérité (multi-device). Sinon (DB vide ET localStorage non-vide), on
  // pousse le localStorage vers la DB (migration silencieuse).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/me/dashboards", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : null;
        if (!rows) return;
        if (rows.length > 0) {
          setCustomReports(rows);
          try {
            localStorage.setItem(CUSTOM_REPORTS_KEY, JSON.stringify(rows));
          } catch {}
        } else {
          // DB vide — migrer le localStorage si non-vide.
          const local = loadCustomReports();
          if (local.length > 0) {
            saveCustomReports(local);
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [showCreateReport, setShowCreateReport] = useState(false);
  // État de la modale "Publier au portail" — ouvre avec un dashboardId
  // ciblé, null = fermée.
  const [publishingDashboardId, setPublishingDashboardId] = useState<string | null>(null);
  const [newReportName, setNewReportName] = useState("");
  const [newReportDesc, setNewReportDesc] = useState("");
  const [newReportWidgets, setNewReportWidgets] = useState<WidgetId[]>([]);
  const [newReportParentId, setNewReportParentId] = useState<string>("");
  const [showParentPanel, setShowParentPanel] = useState(false);
  const [folders, setFolders] = useState<DashboardFolder[]>(() => loadFolders());
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(
    () => loadCollapsedSections(),
  );
  // Menu "•••" pour déplacer un dashboard vers un dossier. Null = fermé.
  const [moveMenuForId, setMoveMenuForId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  // Rename mode pour le dashboard affiché dans le header (custom uniquement).
  const [renamingReport, setRenamingReport] = useState(false);
  const [reportRenameDraft, setReportRenameDraft] = useState("");
  const [renameFolderDraft, setRenameFolderDraft] = useState("");
  // Tag organisation : id du rapport courant dont on veut changer l'org.
  const [taggingReportId, setTaggingReportId] = useState<string | null>(null);
  // Cache orgId → name pour afficher le badge "Pour [org]" sur les rapports.
  const [orgNameById, setOrgNameById] = useState<Record<string, string>>({});
  // Balises (labels libres) : définitions globales + modal CRUD + modal
  // d'attribution à un dashboard précis.
  const [tagDefs, setTagDefs] = useState<TagDef[]>(() => loadTagDefinitions());
  const [managingTags, setManagingTags] = useState(false);
  const [assignTagsReportId, setAssignTagsReportId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  // Id du widget dont on configure l'apparence spécifique à ce dashboard
  // (fontScale, couleur, type de graphique). Null = aucun — popover fermé.
  const [configureItemId, setConfigureItemId] = useState<string | null>(null);
  // Ferme le popover d'apparence dès qu'on quitte le mode édition.
  useEffect(() => { if (!editMode) setConfigureItemId(null); }, [editMode]);
  // Catalogue unifié (built-in + custom) et métadonnées widget-niveau.
  // Remonte queryWidgets au niveau page pour partager avec la modale de
  // création et le drawer d'ajout.
  const [queryWidgets] = useState<QueryWidget[]>(() => loadQueryWidgets());
  const [widgetMeta, setWidgetMeta] = useState<WidgetMetaStore>(() => loadWidgetMeta());
  const [createReportSearch, setCreateReportSearch] = useState("");
  const [widgetAttributeTargetId, setWidgetAttributeTargetId] = useState<string | null>(null);
  const [widgetTagTargetId, setWidgetTagTargetId] = useState<string | null>(null);
  const tagDefById = useMemo(() => {
    const map: Record<string, TagDef> = {};
    for (const t of tagDefs) map[t.id] = t;
    return map;
  }, [tagDefs]);

  // Charge les noms des orgs référencées par les rapports ET widgets
  // taggés (une fois). Inclut les IDs provenant de widgetMeta en plus
  // des customReports — même objectif d'affichage des badges "Pour [org]".
  useEffect(() => {
    const reportOrgIds = customReports.flatMap((r) => getReportOrgs(r));
    const widgetOrgIds = Object.values(widgetMeta).flatMap((m) => m.organizationIds ?? []);
    const ids = Array.from(new Set([...reportOrgIds, ...widgetOrgIds]));
    if (ids.length === 0) return;
    if (ids.every((id) => orgNameById[id])) return;
    fetch("/api/v1/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ id: string; name: string }>) => {
        setOrgNameById((prev) => {
          const next = { ...prev };
          for (const o of list) if (ids.includes(o.id)) next[o.id] = o.name;
          return next;
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customReports, widgetMeta]);

  // Merged catalog: built-in + custom
  // On filtre les built-ins masqués, sauf quand l'user a activé
  // "Afficher les masqués" dans le panneau filtres (pour pouvoir les
  // restaurer ou cliquer dessus temporairement).
  // Si on est en mode atelier organisation, on filtre les rapports custom à
  // cette org (+ les rapports globaux sans orgId) pour que l'agent ne voie
  // que ce qui concerne l'org. Les built-ins du catalogue restent toujours
  // accessibles. Les autres rapports (autres orgs) sont cachés.
  const filteredCustomReports = orgContextId
    ? customReports.filter((r) => {
        const orgs = getReportOrgs(r);
        return orgs.length === 0 || orgs.includes(orgContextId);
      })
    : customReports;
  const allReports = [
    ...REPORT_CATALOG.filter((r) => showHidden || !hiddenBuiltins.has(r.id)),
    ...filteredCustomReports,
  ];

  // Resolve widgets through parent chain (child inherits parent's widgets)
  function resolveWidgets(report: ReportDef): WidgetId[] {
    if (!report.parentId) return report.widgets;
    const parent = allReports.find((r) => r.id === report.parentId);
    if (!parent) return report.widgets;
    return resolveWidgets(parent);
  }

  // Get children of a report
  function getChildren(reportId: string): ReportDef[] {
    return allReports.filter((r) => r.parentId === reportId);
  }

  // Dashboard items layout per report — persisted in localStorage.
  //
  // Héritage parent → enfant : un dashboard enfant (parentId défini) ne
  // garde PAS son propre layout. Il lit et écrit directement dans le
  // layout du parent-racine (en remontant la chaîne). Conséquence : toute
  // modification du parent (ajout/retrait de widgets, réorganisation,
  // apparence) se répercute immédiatement sur ses enfants. Seuls les
  // filtres (org, agent, période) restent per-child.
  function findLayoutRoot(reportId: string): string {
    const report = allReports.find((r) => r.id === reportId);
    if (!report) return reportId;
    let cur = report;
    const seen = new Set<string>();
    while (cur.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const parent = allReports.find((r) => r.id === cur.parentId);
      if (!parent) break;
      cur = parent;
    }
    return cur.id;
  }
  const layoutReportId = findLayoutRoot(view);
  const layoutKey = `nexus:report-layout:${layoutReportId}`;
  const [dashItems, setDashItems] = useState<DashboardItem[]>([]);

  // Build dashboard items from report widgets when view (or parent chain) changes.
  useEffect(() => {
    const report = allReports.find((r) => r.id === view);
    if (!report) return;
    const widgets = resolveWidgets(report);
    // Try to load saved layout — pour un enfant, `layoutKey` pointe déjà
    // vers le layout du parent-racine.
    try {
      const saved = localStorage.getItem(layoutKey);
      if (saved) {
        const parsed = JSON.parse(saved) as DashboardItem[];
        if (parsed.length > 0) { setDashItems(parsed); return; }
      }
    } catch {}
    // Default: build from report widget list with sensible grid sizes
    const defaultW = (wId: string) => wId === "work_orders"
      ? 20
      : (wId.includes("kpis") || wId.includes("trend") || wId.includes("org") || wId.includes("top_") || wId.includes("contract") || wId.includes("projection") ? 10 : 5);
    const defaultH = (wId: string) => wId === "work_orders"
      ? 8
      : (wId.includes("kpis") ? 2 : wId.includes("trend") ? 5 : wId.includes("top_") ? 4 : 3);
    setDashItems(widgets.map((wId, i) => ({
      id: `di_${wId}_${i}`,
      widgetId: wId,
      w: defaultW(wId),
      h: defaultH(wId),
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, layoutReportId, customReports]);

  function persistDashLayout(items: DashboardItem[]) {
    try { localStorage.setItem(layoutKey, JSON.stringify(items)); } catch {}
  }

  /**
   * Applique un changement de layout :
   *   - En mode édition : push l'état courant dans l'historique (pour undo),
   *     vide le futur (les redos deviennent invalides après une nouvelle modif),
   *     met à jour dashItems SANS toucher au localStorage. Le save explicite
   *     commit tout à la fin.
   *   - Hors édition : écrit directement (comportement d'avant).
   */
  function applyLayoutChange(next: DashboardItem[]) {
    if (editMode) {
      setEditHistory((h) => [...h, dashItems]);
      setEditFuture([]);
      setDashItems(next);
    } else {
      setDashItems(next);
      persistDashLayout(next);
    }
  }

  function handleGridReorder(items: DashboardItem[]) { applyLayoutChange(items); }
  function handleGridRemove(id: string) { applyLayoutChange(dashItems.filter((i) => i.id !== id)); }
  function handleGridResize(id: string, w: number, h: number) { applyLayoutChange(dashItems.map((i) => i.id === id ? { ...i, w, h } : i)); }
  function handleGridItemUpdate(id: string, patch: Partial<DashboardItem>) {
    applyLayoutChange(dashItems.map((i) => i.id === id ? { ...i, ...patch } : i));
  }
  function handleGridAdd(widgetId: string) {
    const newItem: DashboardItem = { id: `di_${widgetId}_${Date.now()}`, widgetId, w: 20, h: 3 };
    applyLayoutChange([...dashItems, newItem]);
  }

  // --- Undo / Redo / Save / Cancel (édition) -----------------------------

  function undoEdit() {
    if (editHistory.length === 0) return;
    const prev = editHistory[editHistory.length - 1];
    setEditHistory((h) => h.slice(0, -1));
    setEditFuture((f) => [dashItems, ...f]);
    setDashItems(prev);
  }

  function redoEdit() {
    if (editFuture.length === 0) return;
    const next = editFuture[0];
    setEditFuture((f) => f.slice(1));
    setEditHistory((h) => [...h, dashItems]);
    setDashItems(next);
  }

  function enterEditMode() {
    setEditBaseline(dashItems);
    setEditHistory([]);
    setEditFuture([]);
    setEditMode(true);
  }

  function saveEdit() {
    persistDashLayout(dashItems);
    setEditHistory([]);
    setEditFuture([]);
    setEditBaseline(null);
    setEditMode(false);
  }

  function cancelEdit() {
    if (editBaseline) setDashItems(editBaseline);
    setEditHistory([]);
    setEditFuture([]);
    setEditBaseline(null);
    setEditMode(false);
  }

  // Raccourcis clavier style Office : Ctrl/⌘+Z = undo, Ctrl/⌘+Y (ou
  // Ctrl+Shift+Z) = redo. Actifs UNIQUEMENT en mode édition.
  useEffect(() => {
    if (!editMode) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoEdit();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redoEdit();
      } else if (key === "s") {
        e.preventDefault();
        saveEdit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, editHistory, editFuture, dashItems, editBaseline]);

  // Filtres globaux (panneau Filtres) — déclarés AVANT `load` car la
  // callback en dépend. Restaurés depuis localStorage à chaque changement
  // de dashboard (useEffect plus bas) pour que les filtres appliqués
  // à un dashboard persistent entre sessions.
  const [filterOrg, setFilterOrg] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  // Drapeau « on vient de charger des filtres depuis le storage » — évite
  // que le useEffect de sauvegarde ré-écrive les filtres de l'ancien
  // dashboard sous la clé du nouveau pendant que les setters asynchrones
  // se propagent.
  const skipNextFilterSaveRef = useRef(false);

  // --- Persistance des filtres par dashboard ---
  // À l'ouverture d'un dashboard (view ≠ pseudo-view), restaure ses
  // filtres sauvegardés, ou réinitialise aux valeurs par défaut.
  useEffect(() => {
    if (!isDashboardView(view)) return;
    const saved = loadReportFilters(view) ?? DEFAULT_FILTERS;
    skipNextFilterSaveRef.current = true;
    setFilterOrg(saved.filterOrg);
    setFilterAgent(saved.filterAgent);
    setDays(saved.days);
    setCustomFrom(saved.customFrom);
    setCustomTo(saved.customTo);
  }, [view]);

  // Sauvegarde à chaque modification d'un filtre, sauf juste après un
  // chargement (pour ne pas re-sauvegarder les valeurs fraîchement lues).
  useEffect(() => {
    if (!isDashboardView(view)) return;
    if (skipNextFilterSaveRef.current) {
      skipNextFilterSaveRef.current = false;
      return;
    }
    saveReportFilters(view, { filterOrg, filterAgent, days, customFrom, customTo });
  }, [view, filterOrg, filterAgent, days, customFrom, customTo]);

  const load = useCallback(() => {
    setLoading(true);
    // Pour le range custom, on approxime en jours depuis la plage pour
    // rester compatible avec l'API actuelle (days uniquement). Si on
    // veut passer from/to exacts à l'API global, il faudra l'étendre.
    let effectiveDays = days;
    if (days === "custom" && customFrom && customTo) {
      const from = new Date(customFrom).getTime();
      const to = new Date(customTo).getTime();
      const n = Math.max(1, Math.ceil((to - from) / 86_400_000));
      effectiveDays = String(n);
    }
    // orgContextId (atelier d'org) prime, sinon on prend le filtre « Organisation »
    // du panneau de filtres s'il est actif.
    const effectiveOrgId = orgContextId ?? (filterOrg !== "all" ? filterOrg : null);
    const qs = new URLSearchParams({ days: effectiveDays });
    if (effectiveOrgId) qs.set("organizationId", effectiveOrgId);
    fetch(`/api/v1/reports/global?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days, customFrom, customTo, orgContextId, filterOrg]);

  useEffect(() => { load(); }, [load]);

  function toggleFavorite(reportId: string) {
    setFavorites((prev) => {
      const next = prev.includes(reportId) ? prev.filter((f) => f !== reportId) : [...prev, reportId];
      saveFavorites(next);
      return next;
    });
  }

  function setPrimary(reportId: string) {
    setPrimaryId(reportId);
    savePrimary(reportId);
  }

  // Track les 5 derniers dashboards consultés. Mise à jour à chaque
  // changement de `view` (hors galerie). Le plus récent est en tête.
  useEffect(() => {
    if (!view || isSectionGallery(view)) return;
    setRecent((prev) => {
      const filtered = prev.filter((id) => id !== view);
      const next = [view, ...filtered].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, [view]);

  // ----- Folders management -----
  function addFolder() {
    const name = (prompt("Nom du nouveau dossier ?", "Nouveau dossier") || "").trim();
    if (!name) return;
    const folder: DashboardFolder = {
      id: `folder_${Date.now()}`,
      name,
      dashboardIds: [],
      createdAt: new Date().toISOString(),
    };
    setFolders((prev) => {
      const next = [...prev, folder];
      saveFolders(next);
      return next;
    });
    // Ouvre le nouveau dossier par défaut.
    setCollapsedSections((prev) => {
      const next = { ...prev, [folder.id]: false };
      saveCollapsedSections(next);
      return next;
    });
  }

  function renameFolder(folderId: string, newName: string) {
    const clean = newName.trim();
    if (!clean) return;
    setFolders((prev) => {
      const next = prev.map((f) => (f.id === folderId ? { ...f, name: clean } : f));
      saveFolders(next);
      return next;
    });
  }

  function deleteFolder(folderId: string) {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    if (
      !confirm(
        `Supprimer le dossier "${folder.name}" ? Les dashboards à l'intérieur ne sont pas supprimés, seulement retirés du dossier.`,
      )
    ) {
      return;
    }
    setFolders((prev) => {
      const next = prev.filter((f) => f.id !== folderId);
      saveFolders(next);
      return next;
    });
  }

  function addDashboardToFolder(folderId: string, dashboardId: string) {
    setFolders((prev) => {
      const next = prev.map((f) =>
        f.id === folderId && !f.dashboardIds.includes(dashboardId)
          ? { ...f, dashboardIds: [...f.dashboardIds, dashboardId] }
          : f,
      );
      saveFolders(next);
      return next;
    });
  }

  function removeDashboardFromFolder(folderId: string, dashboardId: string) {
    setFolders((prev) => {
      const next = prev.map((f) =>
        f.id === folderId
          ? { ...f, dashboardIds: f.dashboardIds.filter((id) => id !== dashboardId) }
          : f,
      );
      saveFolders(next);
      return next;
    });
  }

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveCollapsedSections(next);
      return next;
    });
  }

  function createReport() {
    if (!newReportName.trim()) return;
    const id = `custom_${Date.now()}`;
    const parentReport = newReportParentId ? allReports.find((r) => r.id === newReportParentId) : null;
    const report: ReportDef = {
      id,
      label: newReportName.trim(),
      description: newReportDesc.trim() || "Rapport personnalisé",
      icon: <BarChart3 className="h-5 w-5 text-blue-600" />,
      category: "complet",
      widgets: parentReport ? [] : (newReportWidgets.length > 0 ? newReportWidgets : ["ticket_kpis", "finance_kpis"]),
      parentId: newReportParentId || null,
      // Si on est en mode atelier d'une org (?orgContext=X), on attribue
      // le rapport à cette org dès la création (tableau à 1 élément).
      organizationIds: orgContextId ? [orgContextId] : undefined,
    };
    const updated = [...customReports, report];
    setCustomReports(updated);
    saveCustomReports(updated.map((r) => ({ ...r, icon: null })));
    setShowCreateReport(false);
    setNewReportName("");
    setNewReportDesc("");
    setNewReportWidgets([]);
    setNewReportParentId("");
    setView(id);
    setFavorites((prev) => { const next = [...prev, id]; saveFavorites(next); return next; });
  }

  function renameReport(id: string, newLabel: string) {
    const label = newLabel.trim();
    if (!label) return;
    if (!id.startsWith("custom_")) return;  // Built-in reports are fixed.
    const updated = customReports.map((r) => (r.id === id ? { ...r, label } : r));
    setCustomReports(updated);
    saveCustomReports(updated.map((r) => ({ ...r, icon: null })));
  }

  /**
   * Attribue (ou retire) un rapport custom à une organisation. Déclenche une
   * synchronisation avec l'onglet Rapports de l'org concernée via localStorage.
   */
  function setReportOrganizations(reportId: string, organizationIds: string[]) {
    if (!reportId.startsWith("custom_")) return;
    const updated = customReports.map((r) =>
      r.id === reportId
        ? {
            ...r,
            organizationIds: organizationIds.length > 0 ? organizationIds : undefined,
            organizationId: undefined, // migration : on retire le legacy single-org
          }
        : r,
    );
    setCustomReports(updated);
    saveCustomReports(updated.map((r) => ({ ...r, icon: null })));
  }

  function setReportParent(reportId: string, parentId: string | null) {
    const before = customReports.find((r) => r.id === reportId) ?? null;
    const wasChild = !!before?.parentId;
    const oldParentId = before?.parentId ?? null;

    const updated = customReports.map((r) =>
      r.id === reportId ? { ...r, parentId } : r
    );
    setCustomReports(updated);
    saveCustomReports(updated.map((r) => ({ ...r, icon: null })));

    if (parentId) {
      // Devient (ou reste) enfant : supprime son layout propre, il héritera
      // maintenant de celui du parent (findLayoutRoot remonte la chaîne).
      try { localStorage.removeItem(`nexus:report-layout:${reportId}`); } catch {}
    } else if (wasChild) {
      // Devient indépendant : copie le layout qu'il héritait dans sa
      // propre clé pour qu'il garde l'apparence actuelle.
      try {
        let rootId = oldParentId;
        // Remonte la chaîne au cas où l'ancien parent était lui-même un enfant.
        const seen = new Set<string>();
        while (rootId && !seen.has(rootId)) {
          seen.add(rootId);
          const p = customReports.find((r) => r.id === rootId);
          if (!p?.parentId) break;
          rootId = p.parentId;
        }
        if (rootId) {
          const inherited = localStorage.getItem(`nexus:report-layout:${rootId}`);
          if (inherited) localStorage.setItem(`nexus:report-layout:${reportId}`, inherited);
        }
      } catch {}
    }
  }

  /**
   * Duplique un rapport (built-in ou custom) en tant que nouveau rapport
   * custom éditable. Copie les widgets résolus (chaîne parent incluse) et
   * la layout sauvegardée s'il y en a. Ouvre directement le clone.
   */
  function duplicateReport(sourceId: string) {
    const source = allReports.find((r) => r.id === sourceId);
    if (!source) return;
    const id = `custom_${Date.now()}`;
    const widgets = resolveWidgets(source);
    const clone: ReportDef = {
      id,
      label: `${source.label} (copie)`,
      description: source.description,
      icon: <BarChart3 className="h-5 w-5 text-blue-600" />,
      category: source.category,
      widgets: [...widgets],
      parentId: null,
      organizationIds: source.organizationIds ? [...source.organizationIds] : undefined,
      tags: source.tags ? [...source.tags] : undefined,
    };
    const updated = [...customReports, clone];
    setCustomReports(updated);
    saveCustomReports(updated.map((r) => ({ ...r, icon: null })));
    // Recopie la layout sauvegardée du source vers le clone, s'il y en a une.
    try {
      const srcLayout = localStorage.getItem(`nexus:report-layout:${sourceId}`);
      if (srcLayout) localStorage.setItem(`nexus:report-layout:${id}`, srcLayout);
    } catch {}
    setView(id);
  }

  /** Attache/détache des balises (TagDef ids) à un rapport custom. */
  function assignTagsToReport(reportId: string, tagIds: string[]) {
    if (!reportId.startsWith("custom_")) return;
    const updated = customReports.map((r) =>
      r.id === reportId ? { ...r, tags: tagIds.length > 0 ? tagIds : undefined } : r,
    );
    setCustomReports(updated);
    saveCustomReports(updated.map((r) => ({ ...r, icon: null })));
  }

  /** Persiste les définitions de balises (CRUD depuis ManageTagsModal). */
  function updateTagDefinitions(next: TagDef[]) {
    setTagDefs(next);
    saveTagDefinitions(next);
    // Nettoie les références aux balises supprimées sur tous les rapports.
    const valid = new Set(next.map((t) => t.id));
    const cleaned = customReports.map((r) =>
      r.tags && r.tags.length > 0
        ? { ...r, tags: r.tags.filter((id) => valid.has(id)) }
        : r,
    );
    const hasChange = cleaned.some((r, i) => (r.tags ?? []).length !== (customReports[i].tags ?? []).length);
    if (hasChange) {
      setCustomReports(cleaned);
      saveCustomReports(cleaned.map((r) => ({ ...r, icon: null })));
    }
  }

  /** Ajoute une balise à la liste globale (inline depuis AssignTagsModal). */
  function addTagDefinition(tag: TagDef) {
    const next = [...tagDefs, tag];
    setTagDefs(next);
    saveTagDefinitions(next);
  }

  /** Attribue un widget (built-in ou custom) à des organisations. */
  function setWidgetOrganizations(widgetId: string, orgIds: string[]) {
    const next = updateWidgetMeta(widgetMeta, widgetId, { organizationIds: orgIds });
    setWidgetMeta(next);
    saveWidgetMeta(next);
  }

  /** Attache des balises (tag IDs) à un widget (built-in ou custom). */
  function assignTagsToWidget(widgetId: string, tagIds: string[]) {
    const next = updateWidgetMeta(widgetMeta, widgetId, { tags: tagIds });
    setWidgetMeta(next);
    saveWidgetMeta(next);
  }

  /**
   * Construit la liste unifiée des widgets disponibles pour les pickers
   * (modale création + drawer d'ajout). Built-in + custom, dans cet ordre.
   */
  const unifiedWidgets: UnifiedWidget[] = [
    ...WIDGETS.map((w) => ({
      id: w.id as string,
      label: w.label,
      description: w.description,
      icon: w.icon,
      kind: "builtin" as const,
    })),
    ...queryWidgets.map((w) => ({
      id: w.id,
      label: w.name,
      description: w.description,
      icon: <BarChart3 className="h-4 w-4" />,
      kind: "custom" as const,
      color: w.color,
    })),
  ];

  /** Maps utilitaires pour afficher les badges dans le picker. */
  const widgetOrgIdsMap: Record<string, string[]> = {};
  const widgetTagIdsMap: Record<string, string[]> = {};
  for (const id of Object.keys(widgetMeta)) {
    const meta = widgetMeta[id];
    if (meta.organizationIds?.length) widgetOrgIdsMap[id] = meta.organizationIds;
    if (meta.tags?.length) widgetTagIdsMap[id] = meta.tags;
  }

  function deleteReport(id: string) {
    if (id.startsWith("custom_")) {
      // Custom : suppression réelle (retire de la liste + layout + favori).
      if (!confirm("Supprimer ce rapport personnalisé ?")) return;
      // Avant suppression : capture le layout du parent pour le recopier
      // sur chaque enfant orphelin (sinon ils perdent leur apparence
      // héritée en même temps que leur parent).
      let parentLayout: string | null = null;
      try { parentLayout = localStorage.getItem(`nexus:report-layout:${id}`); } catch {}
      const orphans = customReports.filter((r) => r.parentId === id);
      const updated = customReports
        .filter((r) => r.id !== id)
        .map((r) => r.parentId === id ? { ...r, parentId: null } : r);
      setCustomReports(updated);
      saveCustomReports(updated.map((r) => ({ ...r, icon: null })));
      setFavorites((prev) => { const next = prev.filter((f) => f !== id); saveFavorites(next); return next; });
      if (view === id) setView(loadPrimary());
      try { localStorage.removeItem(`nexus:report-layout:${id}`); } catch {}
      // Recopie le layout hérité sur chaque orphelin.
      if (parentLayout) {
        for (const o of orphans) {
          try { localStorage.setItem(`nexus:report-layout:${o.id}`, parentLayout); } catch {}
        }
      }
      return;
    }
    // Built-in : masquage (ajout à un set localStorage). Restaurable
    // depuis le panneau Filtres ("Dashboards masqués").
    if (!confirm("Masquer ce dashboard de la liste ? Il restera restaurable depuis le panneau Filtres.")) return;
    setHiddenBuiltins((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveHiddenBuiltins(next);
      return next;
    });
    setFavorites((prev) => { const next = prev.filter((f) => f !== id); saveFavorites(next); return next; });
    if (view === id) setView(loadPrimary());
  }

  function toggleWidget(id: WidgetId) {
    setVisibleWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      saveVisible(next);
      return next;
    });
  }

  // Global filters — state déclaré plus haut (juste avant `load`).

  // Org and agent lists for filter dropdowns
  const orgList = data ? [...new Set([
    ...data.ticketStats.byOrg.map((o) => ({ id: o.organizationId, name: o.organizationName })),
    ...data.revenueByOrg.map((o) => ({ id: o.organizationId, name: o.organizationName })),
  ].map((o) => JSON.stringify(o)))].map((s) => JSON.parse(s) as { id: string; name: string }) : [];
  const agentList = data ? data.agentBreakdown.map((a) => a.agentName) : [];

  // Apply filters to data
  const filteredData = data ? {
    ...data,
    ticketStats: {
      ...data.ticketStats,
      byOrg: filterOrg !== "all" ? data.ticketStats.byOrg.filter((o) => o.organizationId === filterOrg) : data.ticketStats.byOrg,
    },
    revenueByOrg: filterOrg !== "all" ? data.revenueByOrg.filter((o) => o.organizationId === filterOrg) : data.revenueByOrg,
    agentBreakdown: filterAgent !== "all" ? data.agentBreakdown.filter((a) => a.agentName === filterAgent) : data.agentBreakdown,
    topTickets: filterOrg !== "all" ? data.topTickets.filter((t) => t.organizationName === orgList.find((o) => o.id === filterOrg)?.name) : data.topTickets,
  } : null;

  const activeReport = allReports.find((r) => r.id === view);
  const displayWidgets = activeReport ? resolveWidgets(activeReport) : visibleWidgets;
  const isVis = (id: WidgetId) => displayWidgets.includes(id);

  const tk = data?.ticketKpis;
  const fk = data?.financeKpis;
  const fd = filteredData; // Use filtered data for widgets

  // Remarque : la sidebar n'utilise plus `reportsByCategory` — la nouvelle
  // structure par dossiers (Favoris + Récents + dossiers user + Tous)
  // remplace le groupement par catégorie. La galerie principale continue
  // d'afficher tous les dashboards sans groupement.

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <AnalyticsSectionTabs section="reports" />
      {orgContextId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-start gap-2 flex-wrap">
          <svg className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
          </svg>
          <div className="flex-1 min-w-0 text-[12.5px] text-blue-900">
            <strong>Atelier organisation{orgContextName ? ` : ${orgContextName}` : ""}</strong>
            <div className="text-[11.5px] text-blue-800 mt-0.5">
              Les nouveaux rapports sont attribués à cette organisation et les widgets sont filtrés automatiquement sur ses données.
            </div>
          </div>
          <a href="/analytics/dashboards" className="text-[11.5px] text-blue-700 hover:text-blue-800 underline font-medium shrink-0">
            Voir tous les rapports →
          </a>
        </div>
      )}
      <div className="flex gap-3 min-h-0">
      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* Main content */}
      {/* ============================================================ */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              {renamingReport && activeReport?.id.startsWith("custom_") ? (
                <input
                  autoFocus
                  value={reportRenameDraft}
                  onChange={(e) => setReportRenameDraft(e.target.value)}
                  onBlur={() => {
                    renameReport(activeReport.id, reportRenameDraft);
                    setRenamingReport(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      renameReport(activeReport.id, reportRenameDraft);
                      setRenamingReport(false);
                    }
                    if (e.key === "Escape") {
                      setRenamingReport(false);
                    }
                  }}
                  className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900 bg-white border-b-2 border-blue-400 px-1 py-0.5 focus:outline-none w-full max-w-md"
                />
              ) : (
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
                  {view === GALLERY_VIEW
                    ? "Galerie de tableaux de bord"
                    : view === FAV_VIEW
                      ? "Mes Favoris"
                      : view === RECENT_VIEW
                        ? "Récents"
                        : view === ALL_VIEW
                          ? "Tous les dashboards"
                          : isFolderView(view)
                            ? (folders.find((f) => f.id === folderViewId(view))?.name ?? "Dossier")
                            : activeReport
                              ? activeReport.label
                              : "Dashboards"}
                </h1>
              )}
              <p className="mt-0.5 text-[13px] text-slate-500">
                {view === GALLERY_VIEW
                  ? `${allReports.length} tableau${allReports.length > 1 ? "x" : ""} de bord disponibles — clique pour ouvrir`
                  : view === FAV_VIEW
                    ? `${favorites.length} favori${favorites.length > 1 ? "s" : ""}`
                    : view === RECENT_VIEW
                      ? `${recent.length} dashboard${recent.length > 1 ? "s" : ""} récemment consulté${recent.length > 1 ? "s" : ""}`
                      : view === ALL_VIEW
                        ? `${allReports.length} tableau${allReports.length > 1 ? "x" : ""} de bord`
                        : isFolderView(view)
                          ? (() => {
                              const f = folders.find((fo) => fo.id === folderViewId(view));
                              const n = f?.dashboardIds.length ?? 0;
                              return `${n} tableau${n > 1 ? "x" : ""} de bord dans ce dossier`;
                            })()
                          : activeReport ? activeReport.description : "Tableaux de bord interactifs"}
                {activeReport?.parentId && (() => {
                  const parent = allReports.find((r) => r.id === activeReport.parentId);
                  return parent ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-violet-600 bg-violet-50 rounded px-1.5 py-0.5 font-medium">
                      Hérite de : {parent.label}
                    </span>
                  ) : null;
                })()}
                {activeReport && getChildren(activeReport.id).length > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 font-medium">
                    {getChildren(activeReport.id).length} enfant{getChildren(activeReport.id).length > 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
            {activeReport && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <button
                  onClick={() => toggleFavorite(activeReport.id)}
                  className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center text-[20px] transition-all ring-1 ring-inset",
                    favorites.includes(activeReport.id)
                      ? "text-amber-500 ring-amber-200 bg-amber-50 hover:bg-amber-100"
                      : "text-slate-300 ring-slate-200 bg-white hover:text-amber-400 hover:ring-amber-200 hover:bg-amber-50"
                  )}
                  title={favorites.includes(activeReport.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
                >
                  {favorites.includes(activeReport.id) ? "★" : "☆"}
                </button>
                {activeReport.id.startsWith("custom_") && !renamingReport && (
                  <>
                    {(() => {
                      const orgIds = getReportOrgs(activeReport);
                      const orgNames = orgIds.map((id) => orgNameById[id] ?? "…");
                      const label = orgIds.length === 0
                        ? "Attribuer"
                        : orgIds.length === 1
                        ? orgNames[0]
                        : `${orgIds.length} orgs`;
                      const title = orgIds.length === 0
                        ? "Attribuer à une ou plusieurs organisations"
                        : `Attribué à : ${orgNames.join(", ")}`;
                      return (
                        <button
                          onClick={() => setTaggingReportId(activeReport.id)}
                          className={cn(
                            "h-9 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium ring-1 ring-inset transition-all",
                            orgIds.length > 0
                              ? "bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100"
                              : "bg-white text-slate-500 ring-slate-200 hover:text-blue-600 hover:ring-blue-200 hover:bg-blue-50"
                          )}
                          title={title}
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
                          </svg>
                          <span className="hidden sm:inline max-w-[140px] truncate">{label}</span>
                        </button>
                      );
                    })()}
                    {(() => {
                      const tagIds = activeReport.tags ?? [];
                      const tagNames = tagIds.map((id) => tagDefById[id]?.name).filter(Boolean);
                      const label = tagIds.length === 0
                        ? "Balises"
                        : tagIds.length === 1
                        ? tagNames[0]
                        : `${tagIds.length} balises`;
                      return (
                        <button
                          onClick={() => setAssignTagsReportId(activeReport.id)}
                          className={cn(
                            "h-9 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium ring-1 ring-inset transition-all",
                            tagIds.length > 0
                              ? "bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100"
                              : "bg-white text-slate-500 ring-slate-200 hover:text-violet-600 hover:ring-violet-200 hover:bg-violet-50"
                          )}
                          title={tagIds.length > 0 ? `Balises : ${tagNames.join(", ")}` : "Ajouter des balises"}
                        >
                          <TagIcon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline max-w-[140px] truncate">{label}</span>
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => duplicateReport(activeReport.id)}
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 ring-1 ring-inset ring-slate-200 bg-white hover:text-emerald-600 hover:ring-emerald-200 hover:bg-emerald-50 transition-all"
                      title="Dupliquer ce dashboard"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setReportRenameDraft(activeReport.label);
                        setRenamingReport(true);
                      }}
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 ring-1 ring-inset ring-slate-200 bg-white hover:text-blue-600 hover:ring-blue-200 hover:bg-blue-50 transition-all"
                      title="Renommer le dashboard"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteReport(activeReport.id)}
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 ring-1 ring-inset ring-slate-200 bg-white hover:text-red-600 hover:ring-red-200 hover:bg-red-50 transition-all"
                      title="Supprimer le dashboard"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {activeReport && !activeReport.id.startsWith("custom_") && (
                  <button
                    onClick={() => duplicateReport(activeReport.id)}
                    className="h-9 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200 bg-white hover:text-emerald-700 hover:ring-emerald-200 hover:bg-emerald-50 transition-all"
                    title="Créer une copie éditable de ce dashboard"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Dupliquer</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Les actions "sur dashboard" (filtres, edit, parenté, print)
                n'ont pas de sens sur la galerie — on les masque quand
                aucun dashboard n'est sélectionné. */}
            {!isSectionGallery(view) && (
              <>
                <Button variant={showFilters ? "primary" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)}>
                  <Filter className="h-3.5 w-3.5" />
                  Filtres
                  {(filterOrg !== "all" || filterAgent !== "all" || days !== "30") && (
                    <span className="ml-1 h-4 min-w-[16px] rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center px-1">
                      {(filterOrg !== "all" ? 1 : 0) + (filterAgent !== "all" ? 1 : 0) + (days !== "30" ? 1 : 0)}
                    </span>
                  )}
                </Button>
                {editMode ? (
                  <>
                    {/* Barre d'édition style Office : Undo, Redo, Annuler,
                        Sauvegarder. Les toggles undo/redo sont désactivés
                        si la pile concernée est vide. */}
                    <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-0.5 ring-1 ring-inset ring-slate-200/60">
                      <button
                        type="button"
                        onClick={undoEdit}
                        disabled={editHistory.length === 0}
                        title="Annuler la dernière modification (Ctrl/⌘+Z)"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={redoEdit}
                        disabled={editFuture.length === 0}
                        title="Rétablir la modification (Ctrl/⌘+Y)"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Redo2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelEdit}
                      title="Annuler toutes les modifications et quitter l'édition"
                    >
                      <X className="h-3.5 w-3.5" />
                      Annuler
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={saveEdit}
                      title="Sauvegarder les modifications (Ctrl/⌘+S)"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Sauvegarder
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={enterEditMode}>
                      <LayoutDashboard className="h-3.5 w-3.5" />
                      Éditer
                    </Button>
                    {/* Publier au portail — disponible en mode view,
                        pas en mode édition (éviter de publier un
                        état non sauvegardé). Ouvre la modale qui
                        sérialise l'état persisté. */}
                    {activeReport && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPublishingDashboardId(activeReport.id)}
                          title="Publier ce dashboard au portail client"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          Publier
                        </Button>
                        {/* Supprimer ce dashboard — disponible sur TOUS
                            (custom + built-in). Pour les built-in, c'est
                            en fait un "masquer" qui alimente un set
                            localStorage et peut être rétabli depuis
                            le panneau Filtres. */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteReport(activeReport.id)}
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                          title={activeReport.id.startsWith("custom_")
                            ? "Supprimer ce dashboard"
                            : "Masquer ce dashboard de la liste"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {activeReport.id.startsWith("custom_") ? "Supprimer" : "Masquer"}
                        </Button>
                      </>
                    )}
                  </>
                )}
                <Button
                  variant={showParentPanel ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setShowParentPanel(!showParentPanel)}
                  title="Gérer les relations parent/enfant"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Parenté
                </Button>
                <ExportDashboardButton dashboardLabel={activeReport?.label ?? "dashboard"} />
              </>
            )}
            {/* Mobile-only: dashboard selector — inclut la Galerie comme
                première option pour que le tech mobile puisse revenir à la
                vue d'ensemble sans avoir à ouvrir le drawer. */}
            <div className="md:hidden">
              <Select value={view} onValueChange={(v) => { setView(v); }}>
                <SelectTrigger className="w-52 h-9 text-[12px]">
                  <SelectValue placeholder="Choisir un dashboard..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GALLERY_VIEW}>
                    <span className="flex items-center gap-2">
                      <LayoutDashboard className="h-3 w-3 text-slate-500" />
                      Galerie
                    </span>
                  </SelectItem>
                  {allReports.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        {favorites.includes(r.id) && <span className="text-amber-500 text-[10px]">★</span>}
                        {r.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative hidden md:block">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateMenuOpen((v) => !v)}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau
                <ChevronDown className="h-3 w-3 opacity-80" />
              </Button>
              {createMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setCreateMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-40 w-52 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMenuOpen(false);
                        setShowCreateReport(true);
                      }}
                      className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <LayoutDashboard className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-slate-900">Nouveau dashboard</div>
                        <div className="text-[10.5px] text-slate-500">Assemble tes widgets</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMenuOpen(false);
                        addFolder();
                      }}
                      className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <FolderPlus className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-slate-900">Nouveau dossier</div>
                        <div className="text-[10.5px] text-slate-500">Regroupe plusieurs dashboards</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

      {/* ============================================================ */}
      {/* Parent → enfants : UX inversée. On choisit d'abord un parent
          (n'importe quel dashboard), puis on coche les enfants à
          attacher parmi les dashboards custom disponibles. */}
      {/* ============================================================ */}
      {showParentPanel && (
        <ParentChildrenPanel
          allReports={allReports}
          getChildren={getChildren}
          setReportParent={setReportParent}
          onClose={() => setShowParentPanel(false)}
          initialParentId={view && !isSectionGallery(view) ? view : undefined}
        />
      )}

      {/* ============================================================ */}
      {/* Create report modal */}
      {/* ============================================================ */}
      {showCreateReport && (
        <Card className="border-blue-200 bg-blue-50/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-900">Nouveau rapport</h3>
              <button onClick={() => setShowCreateReport(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Nom du rapport *</label>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none" placeholder="Ex: Rapport hebdomadaire" value={newReportName} onChange={(e) => setNewReportName(e.target.value)} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Description</label>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none" placeholder="Description du rapport" value={newReportDesc} onChange={(e) => setNewReportDesc(e.target.value)} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Dashboard parent</label>
                <Select value={newReportParentId || "_none"} onValueChange={(v) => setNewReportParentId(v === "_none" ? "" : v)}>
                  <SelectTrigger className="text-[13px]"><SelectValue placeholder="Aucun (indépendant)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Aucun (indépendant)</SelectItem>
                    {allReports.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[10px] text-slate-400">
                  Un enfant hérite des widgets de son parent automatiquement.
                </p>
              </div>
            </div>

            {newReportParentId ? (
              <div className="rounded-lg bg-violet-50 border border-violet-200 px-4 py-3 text-[12px] text-violet-800">
                <p className="font-medium">Héritage activé</p>
                <p className="mt-0.5 text-violet-600">
                  Ce dashboard héritera automatiquement des widgets de « {allReports.find((r) => r.id === newReportParentId)?.label} ».
                  Toute modification du parent sera reflétée ici.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-2">Widgets à inclure</label>
                <div className="max-h-[360px] overflow-y-auto pr-1">
                  <WidgetCatalogPicker
                    widgets={unifiedWidgets}
                    search={createReportSearch}
                    onSearchChange={setCreateReportSearch}
                    renderAction={(w) => renderToggleAction(
                      w,
                      newReportWidgets.includes(w.id as WidgetId),
                      (id) => setNewReportWidgets((prev) =>
                        prev.includes(id as WidgetId)
                          ? prev.filter((x) => x !== id)
                          : [...prev, id as WidgetId],
                      ),
                    )}
                    onAttribute={(w) => setWidgetAttributeTargetId(w.id)}
                    onTag={(w) => setWidgetTagTargetId(w.id)}
                    orgIdsByWidgetId={widgetOrgIdsMap}
                    tagIdsByWidgetId={widgetTagIdsMap}
                    orgNameById={orgNameById}
                    tagDefById={tagDefById}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{newReportWidgets.length} widgets sélectionnés — vous pourrez les modifier après la création</p>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="outline" size="sm" onClick={() => setShowCreateReport(false)}>Annuler</Button>
              <Button variant="primary" size="sm" onClick={createReport} disabled={!newReportName.trim()}>
                <Plus className="h-3.5 w-3.5" />
                Créer le rapport
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Filter slide-over (right side) */}
      {/* ============================================================ */}
      {showFilters && (
        <div className="fixed inset-y-0 right-0 z-50 flex print:hidden">
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px]" onClick={() => setShowFilters(false)} />
          <div className="relative ml-auto w-[340px] max-w-[90vw] h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <Filter className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900">Filtres</h2>
                  <p className="text-[11px] text-slate-500">Affiner les données du dashboard</p>
                </div>
              </div>
              <button onClick={() => setShowFilters(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filters */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Active filter badges */}
              {(filterOrg !== "all" || filterAgent !== "all") && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Filtres actifs</p>
                    <button onClick={() => { setFilterOrg("all"); setFilterAgent("all"); }} className="text-[11px] text-red-500 hover:text-red-600 font-medium">
                      Tout effacer
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {filterOrg !== "all" && (
                      <Badge variant="primary" className="text-[11px] flex items-center gap-1">
                        {orgList.find((o) => o.id === filterOrg)?.name}
                        <button onClick={() => setFilterOrg("all")} className="ml-0.5 hover:text-red-200"><X className="h-3 w-3" /></button>
                      </Badge>
                    )}
                    {filterAgent !== "all" && (
                      <Badge variant="primary" className="text-[11px] flex items-center gap-1">
                        {filterAgent}
                        <button onClick={() => setFilterAgent("all")} className="ml-0.5 hover:text-red-200"><X className="h-3 w-3" /></button>
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Période — picker riche avec presets glissants ET
                  presets calendaires (YTD, mois dernier, etc.) + range
                  custom pour une plage arbitraire. Le state `days`
                  continue d'exister pour la compat API mais c'est
                  désormais calculé à partir du preset choisi. */}
              <PeriodPicker
                days={days}
                setDays={setDays}
                customFrom={customFrom}
                customTo={customTo}
                setCustomFrom={setCustomFrom}
                setCustomTo={setCustomTo}
              />

              {/* Dashboards masqués */}
              {hiddenBuiltins.size > 0 && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Dashboards masqués ({hiddenBuiltins.size})
                    </label>
                    <button
                      onClick={() => setShowHidden(!showHidden)}
                      className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {showHidden ? "Masquer" : "Afficher"} la liste
                    </button>
                  </div>
                  {showHidden && (
                    <div className="mt-2 space-y-1">
                      {Array.from(hiddenBuiltins).map((id) => {
                        const rep = REPORT_CATALOG.find((r) => r.id === id);
                        if (!rep) return null;
                        return (
                          <div key={id} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <span className="text-[12px] text-slate-700 truncate">{rep.label}</span>
                            <button
                              onClick={() => setHiddenBuiltins((prev) => {
                                const next = new Set(prev);
                                next.delete(id);
                                saveHiddenBuiltins(next);
                                return next;
                              })}
                              className="text-[10.5px] text-blue-600 hover:text-blue-700 font-medium shrink-0"
                            >
                              Restaurer
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Organization */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Organisation</label>
                <Select value={filterOrg} onValueChange={setFilterOrg}>
                  <SelectTrigger className="text-[12px]"><SelectValue placeholder="Toutes les organisations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les organisations</SelectItem>
                    {orgList.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Technician */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Technicien</label>
                <Select value={filterAgent} onValueChange={setFilterAgent}>
                  <SelectTrigger className="text-[12px]"><SelectValue placeholder="Tous les techniciens" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les techniciens</SelectItem>
                    {agentList.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 px-5 py-3 shrink-0 flex items-center justify-between">
              <button
                onClick={() => { setFilterOrg("all"); setFilterAgent("all"); setDays("30"); }}
                className="text-[12px] text-slate-500 hover:text-slate-700 font-medium"
              >
                Réinitialiser tout
              </button>
              <Button variant="primary" size="sm" onClick={() => setShowFilters(false)}>
                Appliquer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* (Widget config removed — use sidebar editor instead) */}

      {/* (Catalog removed — favorites bar + dropdown replaces it) */}

      {/* ============================================================ */}
      {/* Galerie — page par défaut : dashboards regroupés par dossier */}
      {/* ============================================================ */}
      {view === GALLERY_VIEW && (() => {
        // Regroupe les dashboards par dossier. Un dashboard peut être
        // dans 0, 1 ou plusieurs dossiers → on le duplique visuellement.
        // "Sans dossier" en premier (cohérent avec l'habitude). Les
        // dossiers sont ensuite affichés dans leur ordre de création.
        const unfolderedReports = allReports.filter(
          (r) => !folders.some((f) => f.dashboardIds.includes(r.id)),
        );
        const sections: Array<{ key: string; title: string; icon: React.ReactNode; reports: ReportDef[] }> = [];
        if (unfolderedReports.length > 0) {
          sections.push({
            key: "__none__",
            title: "Sans dossier",
            icon: <LayoutDashboard className="h-4 w-4 text-slate-400" />,
            reports: unfolderedReports,
          });
        }
        for (const folder of folders) {
          const reports = folder.dashboardIds
            .map((id) => allReports.find((r) => r.id === id))
            .filter((r): r is ReportDef => !!r);
          if (reports.length > 0) {
            sections.push({
              key: folder.id,
              title: folder.name,
              icon: <Folder className="h-4 w-4 text-slate-500" />,
              reports,
            });
          }
        }

        return (
          <div className="space-y-8">
            {sections.map((section) => (
              <div key={section.key} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5">
                  {section.icon}
                  <h3 className="text-[13px] font-semibold text-slate-800">{section.title}</h3>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {section.reports.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                  {section.reports.map((r) => (
                    <GalleryCard
                      key={`${section.key}:${r.id}`}
                      report={r}
                      isFav={favorites.includes(r.id)}
                      isPrimary={r.id === primaryId}
                      widgetCount={resolveWidgets(r).length}
                      childCount={getChildren(r.id).length}
                      tagDefs={r.tags?.map((id) => tagDefById[id]).filter(Boolean) as TagDef[] ?? []}
                      orgIds={getReportOrgs(r)}
                      orgNameById={orgNameById}
                      folders={folders}
                      onOpen={() => setView(r.id)}
                      onTagOrg={() => setTaggingReportId(r.id)}
                      onTagLabels={() => setAssignTagsReportId(r.id)}
                      onDuplicate={() => duplicateReport(r.id)}
                      onToggleFolder={(folderId) => {
                        const folder = folders.find((f) => f.id === folderId);
                        if (!folder) return;
                        if (folder.dashboardIds.includes(r.id)) {
                          removeDashboardFromFolder(folderId, r.id);
                        } else {
                          addDashboardToFolder(folderId, r.id);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ============================================================ */}
      {/* Galerie filtrée par section : favoris / récents / tous / dossier. */}
      {/* Clic sur le titre d'une section de la sidebar ouvre ici la grille */}
      {/* des dashboards de cette section.                                  */}
      {/* ============================================================ */}
      {(view === FAV_VIEW || view === RECENT_VIEW || view === ALL_VIEW || isFolderView(view)) && (() => {
        let sectionReports: ReportDef[] = [];
        let emptyTitle = "";
        let emptyHint = "";
        if (view === FAV_VIEW) {
          sectionReports = favorites
            .map((id) => allReports.find((r) => r.id === id))
            .filter((r): r is ReportDef => !!r);
          emptyTitle = "Aucun favori";
          emptyHint = "Clique sur ☆ à côté d'un dashboard pour l'ajouter à tes favoris.";
        } else if (view === RECENT_VIEW) {
          sectionReports = recent
            .map((id) => allReports.find((r) => r.id === id))
            .filter((r): r is ReportDef => !!r);
          emptyTitle = "Aucun dashboard récent";
          emptyHint = "Tes 5 derniers dashboards consultés apparaîtront ici.";
        } else if (view === ALL_VIEW) {
          sectionReports = allReports;
          emptyTitle = "Aucun dashboard";
          emptyHint = "Crée ton premier dashboard pour démarrer.";
        } else if (isFolderView(view)) {
          const folder = folders.find((f) => f.id === folderViewId(view));
          if (!folder) {
            return (
              <Card>
                <CardContent className="p-12 text-center">
                  <Folder className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-[15px] font-semibold text-slate-900">Dossier introuvable</h3>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Ce dossier a peut-être été supprimé.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setView(GALLERY_VIEW)}>
                    Retour à la galerie
                  </Button>
                </CardContent>
              </Card>
            );
          }
          sectionReports = folder.dashboardIds
            .map((id) => allReports.find((r) => r.id === id))
            .filter((r): r is ReportDef => !!r);
          emptyTitle = "Dossier vide";
          emptyHint = "Ajoute des dashboards via le menu ⋯ sur n'importe quel dashboard.";
        }

        if (sectionReports.length === 0) {
          return (
            <Card className="border-dashed border-slate-300">
              <CardContent className="p-14 text-center">
                <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 ring-1 ring-inset ring-blue-100 flex items-center justify-center">
                  <LayoutDashboard className="h-6 w-6 text-blue-500" />
                </div>
                <h3 className="text-[16px] font-semibold text-slate-900">{emptyTitle}</h3>
                <p className="mt-1.5 text-[13px] text-slate-500 max-w-sm mx-auto leading-relaxed">{emptyHint}</p>
                {view === ALL_VIEW && (
                  <Button variant="primary" size="sm" className="mt-5" onClick={() => setShowCreateReport(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Créer un dashboard
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        }

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {sectionReports.map((r) => {
              const isPrimary = r.id === primaryId;
              const isFav = favorites.includes(r.id);
              const widgetCount = resolveWidgets(r).length;
              const childCount = getChildren(r.id).length;
              const isCustom = r.id.startsWith("custom_");
              // Accent par catégorie — bande colorée verticale à gauche
              // + fond icône. Permet de scanner la galerie plus vite.
              const accent = CATEGORY_ACCENT[r.category] ?? CATEGORY_ACCENT.complet;
              const reportTags = (r.tags ?? []).map((id) => tagDefById[id]).filter(Boolean) as TagDef[];
              return (
                <div
                  key={r.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 transition-all cursor-pointer"
                  onClick={() => setView(r.id)}
                >
                  {/* Bande verticale colorée par catégorie — accent visuel subtil */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ backgroundColor: accent.bar }}
                  />
                  <div className="flex flex-col flex-1 p-5 pl-6">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ring-1 ring-inset"
                        style={{
                          backgroundColor: accent.bg,
                          color: accent.fg,
                          boxShadow: `inset 0 0 0 1px ${accent.ring}`,
                        }}
                      >
                        {r.icon}
                      </div>
                      <div className="flex items-center gap-1">
                        {isFav && (
                          <span className="text-amber-500 text-[16px] drop-shadow-sm" title="Favori">★</span>
                        )}
                        {isPrimary && (
                          <span className="text-[8.5px] font-bold uppercase tracking-wider bg-blue-600 text-white rounded-full px-2 py-0.5 shadow-sm">
                            Défaut
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); duplicateReport(r.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-lg bg-slate-100 hover:bg-emerald-600 text-slate-500 hover:text-white inline-flex items-center justify-center"
                          title="Dupliquer"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPublishingDashboardId(r.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-lg bg-slate-100 hover:bg-blue-600 text-slate-500 hover:text-white inline-flex items-center justify-center"
                          title="Publier au portail client"
                        >
                          <Share2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-[15px] font-semibold text-slate-900 leading-tight mb-1.5 group-hover:text-blue-700 transition-colors">
                      {r.label}
                    </h3>
                    <p className="text-[12px] text-slate-500 leading-relaxed line-clamp-2 mb-3">
                      {r.description}
                    </p>
                    {reportTags.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1">
                        {reportTags.map((t) => {
                          const st = tagStyle(t.color);
                          return (
                            <span
                              key={t.id}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${st.bg} ${st.fg} ${st.ring}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                              {t.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-auto flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-700 tabular-nums">
                        {widgetCount} widget{widgetCount > 1 ? "s" : ""}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize"
                        style={{ backgroundColor: accent.bg, color: accent.fg }}
                      >
                        {r.category}
                      </span>
                      {childCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                          {childCount} enfant{childCount > 1 ? "s" : ""}
                        </span>
                      )}
                      {isCustom && (
                        <span className="ml-auto text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                          Custom
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ============================================================ */}
      {/* Dashboard / Report widgets — drag-and-drop grid */}
      {/* ============================================================ */}
      {activeReport && (
        <div data-print-target>
          {/* Bandeau d'en-tête Cetix — visible uniquement à l'export
              (PDF / PNG). Masqué en navigation normale via la classe
              `print-only`. Définit l'identité Cetix sur tous les
              livrables exportés depuis l'analytique. */}
          <div
            className="print-only mb-4 pb-3 border-b border-slate-200"
            data-export-show
            style={{ display: "none" }}
          >
            <div className="flex items-end justify-between gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/cetix-logo-bleu-horizontal-HD.png"
                alt="Cetix"
                style={{ height: "32px", objectFit: "contain" }}
              />
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Rapport analytique
                </div>
                <div className="text-[12px] text-slate-700 font-medium mt-0.5">
                  {activeReport.label}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Généré le {new Date().toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" })}
                </div>
              </div>
            </div>
          </div>

          {loading && !data && (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          )}

          {!loading && dashItems.length === 0 && !editMode && (
            <Card><CardContent className="p-12 text-center">
              <LayoutDashboard className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-[15px] font-semibold text-slate-900">Aucun widget dans ce rapport</h3>
              <p className="mt-1 text-[13px] text-slate-500 mb-4">Ajoutez des widgets prédéfinis ou vos widgets personnalisés.</p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditMode(true);
                  setShowWidgetSidebar(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter un widget
              </Button>
            </CardContent></Card>
          )}

          {data && (dashItems.length > 0 || editMode) && (
            <DashboardGrid
              items={dashItems}
              editMode={editMode}
              onReorder={handleGridReorder}
              onRemove={handleGridRemove}
              onResize={handleGridResize}
              onAddClick={() => setShowWidgetSidebar(true)}
              onConfigure={(id) => setConfigureItemId(id)}
              renderWidget={(widgetId: string, w: number, h: number, item) => {
                // Adapt grid columns based on widget width
                const isNarrow = w <= 4;
                const isWide = w >= 8;
                const kpiCols = isNarrow ? "grid-cols-2" : isWide ? "grid-cols-3 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3";

                const fontScale = item?.fontScale ?? 1;
                const wrap = (node: React.ReactNode) => (
                  fontScale !== 1
                    ? <div style={{ zoom: fontScale }} className="h-full">{node}</div>
                    : node
                );

                const node = (() => {
                switch (widgetId) {
                  case "ticket_kpis":
                    return tk ? (
                      <div className={cn("grid gap-3 p-3", kpiCols)}>
                        <KpiCard label="Créés" value={tk.createdInPeriod} icon={<Ticket className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" href="/tickets" />
                        <KpiCard label="Résolus" value={tk.resolvedInPeriod} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" href="/tickets?status=resolved" />
                        <KpiCard label="Ouverts" value={tk.openTickets} icon={<Clock className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" href="/tickets?status=open" />
                        <KpiCard label="SLA dépassés" value={tk.slaBreached} icon={<AlertTriangle className="h-4 w-4 text-red-600" />} bg="bg-red-50" href="/tickets?sla=breached" />
                        {!isNarrow && <KpiCard label="Conformité SLA" value={`${tk.slaCompliance}%`} icon={<ShieldCheck className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />}
                        {!isNarrow && <KpiCard label="Résolution moy." value={tk.avgResolutionHours != null ? (tk.avgResolutionHours < 24 ? `${tk.avgResolutionHours}h` : `${Math.round(tk.avgResolutionHours / 24)}j`) : "—"} icon={<Timer className="h-4 w-4 text-cyan-600" />} bg="bg-cyan-50" />}
                      </div>
                    ) : null;
                  case "finance_kpis":
                    return fk ? (
                      <div className={cn("grid gap-3 p-3", kpiCols)}>
                        <KpiCard label="Revenus" value={fmtMoney(fk.totalRevenue)} trend={fk.revenueTrend} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" href="/finances" />
                        <KpiCard label="Heures" value={fmtHours(fk.totalHours)} icon={<Clock className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" href="/billing" />
                        <KpiCard label="Taux facturable" value={`${fk.billableRate}%`} icon={<PieChart className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />
                        {!isNarrow && <KpiCard label="Taux horaire moy." value={fmtMoney(fk.avgHourlyRate)} icon={<DollarSign className="h-4 w-4 text-slate-600" />} bg="bg-slate-50" sub="/h" />}
                        {!isNarrow && <KpiCard label="Sur place" value={fmtHours(fk.onsiteHours)} icon={<MapPin className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />}
                        {!isNarrow && <KpiCard label="Hors horaire" value={fmtHours(fk.afterHoursHours)} icon={<Moon className="h-4 w-4 text-indigo-600" />} bg="bg-indigo-50" />}
                      </div>
                    ) : null;
                  case "projection":
                    return fk ? (
                      <Card>
                        <CardContent className="p-5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
                              <div><p className="text-[14px] font-semibold text-slate-900">Projection mensuelle</p><p className="text-[12px] text-slate-500">Moyenne quotidienne de la période</p></div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right"><p className="text-[11px] text-slate-500">Projeté</p><p className="text-xl font-bold text-emerald-700 tabular-nums">{fmtMoney(fk.projectedMonthlyRevenue)}</p></div>
                              {fk.monthlyContractValue > 0 && <div className="text-right"><p className="text-[11px] text-slate-500">Récurrent</p><p className="text-xl font-bold text-blue-700 tabular-nums">{fmtMoney(fk.monthlyContractValue)}/mois</p></div>}
                              <div className="text-right"><p className="text-[11px] text-slate-500">Contrats</p><p className="text-xl font-bold text-slate-700 tabular-nums">{fk.activeContractsCount}</p></div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : null;
                  case "monthly_trend":
                    return <MonthlyTrendWidget data={data} />;
                  case "tickets_status":
                    return fd ? <BarBreakdown title="Par statut" icon={<Ticket className="h-4 w-4 text-slate-500" />} linkPrefix="/tickets?status=" items={fd.ticketStats.byStatus.map((s) => ({ key: s.status, label: STATUS_LABELS[s.status] ?? s.status, count: s.count, color: STATUS_COLORS[s.status] ?? "bg-slate-400" }))} /> : null;
                  case "tickets_priority":
                    return fd ? <BarBreakdown title="Par priorité" icon={<AlertTriangle className="h-4 w-4 text-slate-500" />} linkPrefix="/tickets?priority=" items={fd.ticketStats.byPriority.map((p) => ({ key: p.priority, label: PRIORITY_LABELS[p.priority] ?? p.priority, count: p.count, color: PRIORITY_COLORS[p.priority] ?? "bg-slate-400" }))} /> : null;
                  case "tickets_type":
                    return fd ? <BarBreakdown title="Par type" icon={<FileText className="h-4 w-4 text-slate-500" />} linkPrefix="/tickets?type=" items={fd.ticketStats.byType.map((t) => ({ key: t.type, label: TYPE_LABELS[t.type] ?? t.type, count: t.count, color: "bg-blue-500" }))} /> : null;
                  case "tickets_org":
                    return fd ? (
                      <Card>
                        <CardContent className="p-5">
                          <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-500" /> Tickets par client</h3>
                          {fd.ticketStats.byOrg.length > 0 ? (
                            <div className="space-y-2">{fd.ticketStats.byOrg.map((o) => { const max = fd.ticketStats.byOrg[0]?.count || 1; return (
                              <Link key={o.organizationId} href={`/organizations/${o.organizationId}`} className="flex items-center gap-3 group rounded-lg px-1 -mx-1 py-0.5 hover:bg-slate-50 transition-colors"><span className="text-[12px] text-slate-700 w-40 truncate font-medium group-hover:text-blue-600">{o.organizationName}</span><div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(o.count / max) * 100}%` }} /></div><span className="text-[12px] font-bold text-slate-800 tabular-nums w-10 text-right">{o.count}</span></Link>
                            ); })}</div>
                          ) : <p className="text-[12px] text-slate-400 py-6 text-center">Aucun ticket</p>}
                        </CardContent>
                      </Card>
                    ) : null;
                  case "agent_performance":
                    return fd ? <AgentWidget data={fd} /> : null;
                  case "coverage_breakdown":
                    return fd ? <CoverageWidget data={fd} /> : null;
                  case "revenue_by_org":
                    return fd ? (
                      <Card>
                        <CardContent className="p-5">
                          <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-500" /> Revenus par client</h3>
                          {fd.revenueByOrg.length > 0 ? (
                            <div className="space-y-2.5">{fd.revenueByOrg.map((o) => { const max = fd.revenueByOrg[0]?.revenue || 1; return (
                              <Link key={o.organizationId} href={`/organizations/${o.organizationId}`} className="flex items-center gap-3 group rounded-lg px-1 -mx-1 py-0.5 hover:bg-slate-50 transition-colors"><span className="text-[12px] text-slate-700 w-40 truncate font-medium group-hover:text-blue-600">{o.organizationName}</span><div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(o.revenue / max) * 100}%` }} /></div><span className="text-[12px] font-bold text-slate-800 tabular-nums w-24 text-right">{fmtMoney(o.revenue)}</span><span className="text-[10px] text-slate-400 w-12 text-right tabular-nums">{fmtHours(o.hours)}</span></Link>
                            ); })}</div>
                          ) : <p className="text-[12px] text-slate-400 py-6 text-center">Aucun revenu</p>}
                        </CardContent>
                      </Card>
                    ) : null;
                  case "contract_usage":
                    return fd ? <ContractUsageWidget data={fd} /> : null;
                  case "top_tickets":
                    return fd ? <TopTicketsWidget data={fd} /> : null;
                  case "work_orders":
                    return <WorkOrdersListWidget
                      dashboardDays={days === "custom" ? 0 : (Number(days) || 30)}
                      customFrom={days === "custom" ? customFrom : undefined}
                      customTo={days === "custom" ? customTo : undefined}
                      orgContextId={orgContextId ?? (filterOrg !== "all" ? filterOrg : null)}
                    />;
                  default:
                    return <QueryWidgetRenderer
                      widgetId={widgetId}
                      dashboardDays={days === "custom" ? 0 : (Number(days) || 30)}
                      customFrom={days === "custom" ? customFrom : undefined}
                      customTo={days === "custom" ? customTo : undefined}
                      overrideColor={item?.overrideColor}
                      overrideChartType={item?.overrideChartType}
                      titleScale={item?.titleScale}
                      chartScale={item?.chartScale}
                      orgContextId={orgContextId ?? (filterOrg !== "all" ? filterOrg : null)}
                    />;
                }
                })();
                return wrap(node);
              }}
            />
          )}
        </div>
      )}

      {/* Widget sidebar — built-in + custom widgets */}
      {showWidgetSidebar && (
        <WidgetAddPanel
          dashItems={dashItems}
          onAdd={handleGridAdd}
          onClose={() => setShowWidgetSidebar(false)}
          widgets={unifiedWidgets}
          onAttribute={(widgetId) => setWidgetAttributeTargetId(widgetId)}
          onTag={(widgetId) => setWidgetTagTargetId(widgetId)}
          widgetOrgIdsMap={widgetOrgIdsMap}
          widgetTagIdsMap={widgetTagIdsMap}
          orgNameById={orgNameById}
          tagDefById={tagDefById}
          hasCustomWidgets={queryWidgets.length > 0}
        />
      )}

      {/* Modale "Publier au portail" — sérialise le dashboard + ses
          widgets custom et appelle /api/v1/dashboards/published. */}
      {publishingDashboardId && (
        <PublishDashboardModal
          dashboard={allReports.find((r) => r.id === publishingDashboardId)!}
          onClose={() => setPublishingDashboardId(null)}
        />
      )}

      {taggingReportId && (() => {
        const rep = customReports.find((r) => r.id === taggingReportId);
        return (
          <TagOrganizationModal
            open
            onClose={() => setTaggingReportId(null)}
            itemLabel="Rapport"
            itemName={rep?.label}
            currentOrgIds={rep ? getReportOrgs(rep) : []}
            onSave={(orgIds) => setReportOrganizations(taggingReportId, orgIds)}
          />
        );
      })()}

      <ManageTagsModal
        open={managingTags}
        onClose={() => setManagingTags(false)}
        tags={tagDefs}
        onSave={(next) => updateTagDefinitions(next)}
      />

      {assignTagsReportId && (() => {
        let rep = customReports.find((r) => r.id === assignTagsReportId);
        // Si l'user clique "Balises" sur un built-in, duplique d'abord en
        // custom pour rendre les balises modifiables puis réouvre la modal
        // sur la copie — mais pour simplifier on exige un custom existant.
        if (!rep) return null;
        return (
          <AssignTagsModal
            open
            onClose={() => setAssignTagsReportId(null)}
            itemName={rep.label}
            currentTagIds={rep.tags ?? []}
            allTags={tagDefs}
            onCreateTag={(tag) => addTagDefinition(tag)}
            onSaveAssignment={(ids) => assignTagsToReport(assignTagsReportId, ids)}
          />
        );
      })()}

      {configureItemId && (() => {
        const target = dashItems.find((i) => i.id === configureItemId);
        if (!target) return null;
        const BUILTIN_IDS = new Set<string>(WIDGETS.map((w) => w.id));
        const supportsStyleOverride = !BUILTIN_IDS.has(target.widgetId);
        return (
          <DashboardItemAppearance
            item={target}
            supportsStyleOverride={supportsStyleOverride}
            onChange={(patch) => handleGridItemUpdate(target.id, patch)}
            onClose={() => setConfigureItemId(null)}
          />
        );
      })()}

      {widgetAttributeTargetId && (() => {
        const w = unifiedWidgets.find((x) => x.id === widgetAttributeTargetId);
        const meta = widgetMeta[widgetAttributeTargetId] ?? {};
        return (
          <TagOrganizationModal
            open
            onClose={() => setWidgetAttributeTargetId(null)}
            itemLabel="Widget"
            itemName={w?.label}
            currentOrgIds={meta.organizationIds ?? []}
            onSave={(orgIds) => setWidgetOrganizations(widgetAttributeTargetId, orgIds)}
          />
        );
      })()}

      {widgetTagTargetId && (() => {
        const w = unifiedWidgets.find((x) => x.id === widgetTagTargetId);
        const meta = widgetMeta[widgetTagTargetId] ?? {};
        return (
          <AssignTagsModal
            open
            onClose={() => setWidgetTagTargetId(null)}
            itemName={w?.label}
            currentTagIds={meta.tags ?? []}
            allTags={tagDefs}
            onCreateTag={(tag) => addTagDefinition(tag)}
            onSaveAssignment={(ids) => assignTagsToWidget(widgetTagTargetId, ids)}
          />
        );
      })()}

      </div>
    </div>
    </div>
  );
}

// ===========================================================================
// GalleryCard — carte d'un dashboard dans la galerie (vue par défaut et
// vue par dossier). Affiche les infos de base + actions de survol
// (dupliquer, attribution org, balises).
// ===========================================================================
function GalleryCard({
  report, isFav, isPrimary, widgetCount, childCount, tagDefs,
  orgIds, orgNameById, folders, onOpen, onTagOrg, onTagLabels,
  onDuplicate, onToggleFolder,
}: {
  report: ReportDef;
  isFav: boolean;
  isPrimary: boolean;
  widgetCount: number;
  childCount: number;
  tagDefs: TagDef[];
  orgIds: string[];
  orgNameById: Record<string, string>;
  folders: DashboardFolder[];
  onOpen: () => void;
  onTagOrg: () => void;
  onTagLabels: () => void;
  onDuplicate: () => void;
  onToggleFolder: (folderId: string) => void;
}) {
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const isCustom = report.id.startsWith("custom_");
  const currentFolderIds = folders.filter((f) => f.dashboardIds.includes(report.id)).map((f) => f.id);
  const orgLabel = orgIds.length === 0 ? "" : orgIds.length === 1 ? (orgNameById[orgIds[0]] ?? "…") : `${orgIds.length} orgs`;
  const orgTitle = orgIds.length === 0
    ? "Attribuer à une ou plusieurs organisations"
    : `Attribué à : ${orgIds.map((id) => orgNameById[id] ?? "…").join(", ")}`;
  return (
    <div
      className="group relative flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-blue-300 hover:shadow-[0_8px_24px_-8px_rgba(37,99,235,0.18)] transition-all min-h-[160px]"
    >
      {/* Actions sur le coin supérieur droit — hover-only sauf l'attribution
          org qui reste visible quand il y a déjà des orgs attribuées. */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        {isCustom && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onTagOrg(); }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium transition-all",
              orgIds.length > 0
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-white/90 text-slate-600 ring-1 ring-slate-200 opacity-0 group-hover:opacity-100 hover:bg-blue-50 hover:text-blue-700 hover:ring-blue-300",
            )}
            title={orgTitle}
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
            </svg>
            {orgLabel && <span className="max-w-[80px] truncate">{orgLabel}</span>}
          </button>
        )}
        {isCustom && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onTagLabels(); }}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-white/90 text-slate-500 ring-1 ring-slate-200 opacity-0 group-hover:opacity-100 hover:bg-violet-50 hover:text-violet-700 hover:ring-violet-300 transition-all"
            title="Balises"
          >
            <TagIcon className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-white/90 text-slate-500 ring-1 ring-slate-200 opacity-0 group-hover:opacity-100 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-300 transition-all"
          title="Dupliquer"
        >
          <Copy className="h-3 w-3" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFolderMenuOpen((v) => !v); }}
            className={cn(
              "inline-flex items-center justify-center h-6 w-6 rounded-md ring-1 transition-all",
              currentFolderIds.length > 0
                ? "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100"
                : "bg-white/90 text-slate-500 ring-slate-200 opacity-0 group-hover:opacity-100 hover:bg-amber-50 hover:text-amber-700 hover:ring-amber-300",
            )}
            title={
              currentFolderIds.length === 0
                ? "Ajouter à un dossier"
                : `Dans ${currentFolderIds.length} dossier${currentFolderIds.length > 1 ? "s" : ""}`
            }
          >
            <Folder className="h-3 w-3" />
          </button>
          {folderMenuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-30 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1"
              onClick={(e) => e.stopPropagation()}
              onMouseLeave={() => setFolderMenuOpen(false)}
            >
              <p className="px-3 py-1 text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                Dossiers
              </p>
              {folders.length === 0 ? (
                <p className="px-3 py-1.5 text-[11px] text-slate-500 italic">
                  Aucun dossier — crée-en un depuis la sidebar ou le bouton « + Nouveau ».
                </p>
              ) : (
                folders.map((f) => {
                  const isIn = f.dashboardIds.includes(report.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFolder(f.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 text-left"
                    >
                      <div className={cn(
                        "h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center",
                        isIn ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white",
                      )}>
                        {isIn && <CheckCircle2 className="h-2.5 w-2.5" />}
                      </div>
                      <Folder className="h-3 w-3 text-blue-500 shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col text-left p-4 flex-1"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="h-9 w-9 rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            {report.icon}
          </div>
          <div className="flex items-center gap-1 pr-24">
            {isFav && <span className="text-amber-500 text-[13px]" title="Favori">★</span>}
            {isPrimary && (
              <span className="text-[8.5px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
                Défaut
              </span>
            )}
          </div>
        </div>
        <h3 className="text-[13.5px] font-semibold text-slate-900 leading-tight mb-1 group-hover:text-blue-700 transition-colors line-clamp-2">
          {report.label}
        </h3>
        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 mb-2">
          {report.description}
        </p>
        {tagDefs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {tagDefs.map((t) => {
              const st = tagStyle(t.color);
              return (
                <span
                  key={t.id}
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[9.5px] font-medium ring-1 ring-inset ${st.bg} ${st.fg} ${st.ring}`}
                >
                  <span className={`h-1 w-1 rounded-full ${st.dot}`} />
                  {t.name}
                </span>
              );
            })}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0 text-[10px] font-medium text-slate-600 tabular-nums">
            {widgetCount}w
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0 text-[10px] font-medium text-slate-500 capitalize">
            {report.category}
          </span>
          {childCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0 text-[10px] font-medium text-violet-700">
              {childCount} enfant{childCount > 1 ? "s" : ""}
            </span>
          )}
          {report.parentId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0 text-[10px] font-medium text-violet-700" title="Hérite d'un parent">↳</span>
          )}
        </div>
      </button>
    </div>
  );
}

// ===========================================================================
// PublishDashboardModal — snapshot du dashboard (widgets + layout) +
// envoi à /api/v1/dashboards/published. Permet aussi de RETIRER une
// publication existante.
// ===========================================================================
function PublishDashboardModal({
  dashboard, onClose,
}: {
  dashboard: ReportDef;
  onClose: () => void;
}) {
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [existing, setExisting] = useState<{ id: string; organizationId: string | null; organizationName: string | null; updatedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [orgsRes, pubRes] = await Promise.all([
        fetch("/api/v1/organizations").then((r) => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/v1/dashboards/published?dashboardKey=${encodeURIComponent(dashboard.id)}`)
          .then((r) => r.ok ? r.json() : [])
          .catch(() => []),
      ]);
      const orgList = Array.isArray(orgsRes) ? orgsRes : (orgsRes?.data ?? []);
      setOrgs(orgList.map((o: any) => ({ id: o.id, name: o.name })));
      const publishedHere = Array.isArray(pubRes) ? pubRes[0] : null;
      if (publishedHere) {
        setExisting({
          id: publishedHere.id,
          organizationId: publishedHere.organizationId,
          organizationName: publishedHere.organizationName,
          updatedAt: publishedHere.updatedAt,
        });
        setOrgId(publishedHere.organizationId ?? "");
      }
      setLoading(false);
    }
    load();
  }, [dashboard.id]);

  // Sérialise le dashboard : on prend le layout depuis localStorage
  // (nexus:report-layout:{id}) et les widgets custom concernés.
  function buildSnapshot() {
    const layoutRaw = localStorage.getItem(`nexus:report-layout:${dashboard.id}`);
    const layout: any[] = layoutRaw ? JSON.parse(layoutRaw) : [];
    const usedWidgetIds = new Set(layout.map((it: any) => it.widgetId));
    const allWidgetsRaw = localStorage.getItem(QUERY_WIDGETS_KEY);
    const allWidgets: any[] = allWidgetsRaw ? JSON.parse(allWidgetsRaw) : [];
    // On ne retient que les widgets custom référencés par le layout —
    // les widgets built-in (ticket_kpis, finance_kpis, …) ne sont pas
    // publiables au portail (ils s'appuient sur des endpoints agent).
    const widgets = allWidgets.filter((w) => usedWidgetIds.has(w.id));
    // Filtre le layout aux seuls items dont le widget est inclus.
    const includedIds = new Set(widgets.map((w) => w.id));
    const cleanLayout = layout.filter((it: any) => includedIds.has(it.widgetId));
    return { widgets, layout: cleanLayout };
  }

  async function publish() {
    setSaving(true);
    setMsg(null);
    const snapshot = buildSnapshot();
    if (snapshot.widgets.length === 0) {
      setMsg("Ce dashboard ne contient aucun widget personnalisé publiable.");
      setSaving(false);
      return;
    }
    const res = await fetch("/api/v1/dashboards/published", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dashboardKey: dashboard.id,
        label: dashboard.label,
        description: dashboard.description,
        organizationId: orgId || null,
        config: snapshot,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(`Échec : ${d.error ?? res.status}`);
    } else {
      setMsg("Dashboard publié ✓");
      setTimeout(onClose, 1200);
    }
    setSaving(false);
  }

  async function unpublish() {
    if (!existing) return;
    if (!confirm("Retirer ce dashboard du portail client ?")) return;
    setSaving(true);
    const res = await fetch(`/api/v1/dashboards/published?id=${existing.id}`, { method: "DELETE" });
    if (res.ok) {
      setExisting(null);
      setMsg("Publication retirée.");
      setTimeout(onClose, 1000);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-lg my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Publier au portail client</h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">{dashboard.label}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="py-8 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-[11.5px] text-blue-900 leading-relaxed">
                <strong>Snapshot figé.</strong> Le portail affiche la version publiée
                ici. Toute modification ultérieure du dashboard côté agent n&apos;aura
                effet que si tu re-publies depuis cette fenêtre.
                <br />
                <br />
                Seuls les <strong>widgets personnalisés</strong> (basés sur requêtes)
                sont publiés. Les widgets KPI intégrés (tickets, finance…) restent
                agent-only.
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
                  Organisation destinataire
                </label>
                <Select value={orgId || "__all__"} onValueChange={(v) => setOrgId(v === "__all__" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Toutes les organisations (portail)</SelectItem>
                    {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Les contacts de cette organisation verront le dashboard dans
                  leur section <strong>Rapports</strong> (s&apos;ils ont la permission
                  de voir les rapports). Les requêtes sont automatiquement
                  scopées à leur organisation.
                </p>
              </div>

              {existing && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-[11.5px] text-emerald-900">
                  ✓ Déjà publié pour {existing.organizationName ?? "toutes les organisations"} le{" "}
                  {new Date(existing.updatedAt).toLocaleDateString("fr-CA")}
                </div>
              )}

              {msg && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                  {msg}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-slate-200">
          {existing ? (
            <Button variant="outline" size="sm" onClick={unpublish} disabled={saving} className="text-red-600 hover:text-red-700">
              Retirer du portail
            </Button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
            <Button variant="primary" size="sm" onClick={publish} disabled={saving || loading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {existing ? "Re-publier" : "Publier"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Query widget renderer — loads & executes a custom widget's query
// ===========================================================================
function QueryWidgetRenderer({
  widgetId,
  dashboardDays = 30,
  customFrom,
  customTo,
  overrideColor,
  overrideChartType,
  titleScale = 1,
  chartScale = 1,
  orgContextId,
}: {
  widgetId: string;
  /**
   * Jours glissants. > 0 = calcule un range [now - days, now].
   * 0 = pas d'override (laisse le widget utiliser sa propre config,
   * ou "toute la période" si le widget n'en a pas) — utilisé quand
   * l'user a sélectionné "Plage personnalisée" (voir customFrom/To).
   */
  dashboardDays?: number;
  /** Range custom (ISO yyyy-mm-dd). Pris en compte si dashboardDays === 0. */
  customFrom?: string;
  customTo?: string;
  /** Override de couleur pour ce widget dans ce dashboard uniquement. */
  overrideColor?: string;
  /** Override du type de graphique pour ce widget dans ce dashboard uniquement. */
  overrideChartType?: string;
  /** Échelle du titre (rendu séparément au-dessus du graphique). */
  titleScale?: number;
  /** Échelle du graphique (wrapper zoom autour de WidgetChart). */
  chartScale?: number;
  /**
   * Si défini, injecte automatiquement un filtre `organizationId = X` dans
   * la requête — utilisé quand le dashboard est vu dans le contexte d'une
   * organisation (atelier ou onglet Rapports d'org). Évite à l'utilisateur
   * de créer un dashboard par client : un seul rapport global suffit.
   */
  orgContextId?: string | null;
}) {
  const [result, setResult] = useState<{ label: string; value: number }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [widget, setWidget] = useState<QueryWidget | null>(null);

  useEffect(() => {
    const widgets = loadQueryWidgets();
    const w = widgets.find((x) => x.id === widgetId);
    if (!w) { setLoading(false); return; }
    setWidget(w);

    // Cascade période :
    //  - dashboardDays > 0 → range glissant [now - N, now]
    //  - dashboardDays = 0 + customFrom/To → range fixe
    //  - sinon → pas d'override, le widget utilise ses propres dates
    //    (ou aucune si dateField absent).
    let overrideDateFrom: string | undefined;
    let overrideDateTo: string | undefined;
    if (dashboardDays > 0 && w.query?.dateField) {
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - dashboardDays);
      overrideDateFrom = from.toISOString();
      overrideDateTo = to.toISOString();
    } else if (dashboardDays === 0 && customFrom && customTo && w.query?.dateField) {
      overrideDateFrom = new Date(customFrom).toISOString();
      // Ajoute 23:59:59 à customTo pour inclure toute la journée.
      const toDate = new Date(customTo);
      toDate.setHours(23, 59, 59, 999);
      overrideDateTo = toDate.toISOString();
    }

    // Injection automatique d'un filtre organisation quand on est dans un
    // contexte d'org (atelier ou onglet Rapports de l'org). Respecte les
    // filtres existants : on remplace un éventuel filtre organizationId
    // déjà présent pour éviter les contradictions.
    const baseFilters = Array.isArray(w.query?.filters) ? (w.query.filters as Array<{ field: string; operator: string; value: string }>) : [];
    const filtersWithOrg = orgContextId
      ? [
          ...baseFilters.filter((f) => f.field !== "organizationId"),
          { field: "organizationId", operator: "eq", value: orgContextId },
        ]
      : baseFilters;

    fetch("/api/v1/analytics/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...w.query, filters: filtersWithOrg, overrideDateFrom, overrideDateTo }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.results) {
          // Remap timeType raw → libellé catégorie de base (côté client,
          // puisque les customisations user vivent en localStorage).
          setResult(remapBaseCategoryResults(
            (w.query?.groupBy as string | undefined) ?? null,
            d.results,
          ));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [widgetId, dashboardDays, customFrom, customTo, orgContextId]);

  if (loading) return <Card><CardContent className="p-5 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></CardContent></Card>;
  if (!widget) return <Card><CardContent className="p-5 text-center text-slate-400 text-[13px]">Widget « {widgetId} » introuvable</CardContent></Card>;
  if (!result) return <Card><CardContent className="p-5 text-center text-slate-400 text-[13px]">Aucune donnée</CardContent></Card>;

  // Drill-down : click sur un point de données → liste filtrée
  // correspondante (tickets, time_entries, contacts, etc.).
  const dataset = typeof widget.query?.dataset === "string" ? widget.query.dataset : "";
  const groupBy = typeof widget.query?.groupBy === "string" ? widget.query.groupBy : "";
  const existingFilters = Array.isArray(widget.query?.filters) ? widget.query.filters : [];
  const handleDrillDown = (dataset && groupBy) ? (label: string) => {
    const url = buildDrillDownUrl({
      dataset,
      groupBy,
      rawLabel: label,
      existingFilters: existingFilters as Array<{ field: string; operator?: string; value: string }>,
    });
    if (url) window.location.href = url;
  } : undefined;

  // Délègue le rendu au composant partagé qui gère les 19 types de
  // graphiques — mêmes règles que dans /analytics/widgets.
  return (
    <Card>
      <CardContent className="p-4">
        {widget.name && (
          <div
            style={titleScale !== 1 ? { zoom: titleScale } : undefined}
            className="mb-1"
          >
            <p className="text-[12px] font-semibold text-slate-800">{widget.name}</p>
          </div>
        )}
        <div style={chartScale !== 1 ? { zoom: chartScale } : undefined}>
          <WidgetChart
            results={result}
            chartType={(overrideChartType || widget.chartType) as ChartType}
            color={overrideColor || widget.color || "#2563eb"}
            name=""
            aggregate={typeof widget.query?.aggregate === "string" ? widget.query.aggregate : undefined}
            onDrillDown={handleDrillDown}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Widget add panel — shows built-in WIDGETS + user query-builder widgets
// ===========================================================================
const QUERY_WIDGETS_KEY = "nexus:custom-widgets-v2";

interface QueryWidget {
  id: string;
  name: string;
  description: string;
  chartType: string;
  color: string;
  query: Record<string, unknown>;
  createdAt: string;
}

function loadQueryWidgets(): QueryWidget[] {
  try { const r = localStorage.getItem(QUERY_WIDGETS_KEY); if (r) return JSON.parse(r); } catch {}
  return [];
}

function WidgetAddPanel({
  dashItems, onAdd, onClose, widgets,
  onAttribute, onTag, widgetOrgIdsMap, widgetTagIdsMap,
  orgNameById, tagDefById, hasCustomWidgets,
}: {
  dashItems: DashboardItem[];
  onAdd: (widgetId: string) => void;
  onClose: () => void;
  widgets: UnifiedWidget[];
  onAttribute: (widgetId: string) => void;
  onTag: (widgetId: string) => void;
  widgetOrgIdsMap: Record<string, string[]>;
  widgetTagIdsMap: Record<string, string[]>;
  orgNameById: Record<string, string>;
  tagDefById: Record<string, TagDef>;
  hasCustomWidgets: boolean;
}) {
  const [search, setSearch] = useState("");

  // Cache les FABs flottants (AI chat, Bug report) pendant que ce panneau
  // est ouvert — sinon le dernier widget de la liste est caché derrière eux.
  useEffect(() => {
    document.body.setAttribute("data-hide-floating-ui", "1");
    return () => { document.body.removeAttribute("data-hide-floating-ui"); };
  }, []);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex print:hidden">
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative ml-auto w-[420px] max-w-[90vw] h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">Ajouter des widgets</h2>
              <p className="text-[11px] text-slate-500">
                {dashItems.length} widget{dashItems.length > 1 ? "s" : ""} actuellement
                {!hasCustomWidgets && (
                  <>
                    {" · "}
                    <Link href="/analytics/widgets" className="text-blue-600 hover:text-blue-700">
                      Créer un widget perso
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <WidgetCatalogPicker
            widgets={widgets}
            search={search}
            onSearchChange={setSearch}
            renderAction={(w) => renderAddAction(
              w,
              dashItems.some((di) => di.widgetId === w.id),
              onAdd,
            )}
            onAttribute={(w) => onAttribute(w.id)}
            onTag={(w) => onTag(w.id)}
            orgIdsByWidgetId={widgetOrgIdsMap}
            tagIdsByWidgetId={widgetTagIdsMap}
            orgNameById={orgNameById}
            tagDefById={tagDefById}
          />
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// SUB-COMPONENTS
// ===========================================================================

function MonthlyTrendWidget({ data }: { data: ReportData }) {
  const maxH = Math.max(...data.monthlyBreakdown.map((m) => m.hours), 1);
  const maxR = Math.max(...data.monthlyBreakdown.map((m) => m.revenue), 1);
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-slate-500" /> Tendance mensuelle (12 mois)</h3>
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">Heures</p>
            <div className="flex items-end gap-1 h-28">
              {data.monthlyBreakdown.map((m) => {
                const pct = (m.hours / maxH) * 100;
                const bp = m.hours > 0 ? (m.billableHours / m.hours) * 100 : 0;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group cursor-pointer" title={`${m.month}: ${fmtHours(m.hours)} — ${fmtMoney(m.revenue)}`}>
                    <div className="w-full relative group-hover:scale-105 transition-transform" style={{ height: "100px" }}>
                      <div className="absolute bottom-0 left-0 right-0 rounded-t bg-slate-200 group-hover:bg-slate-300 transition-all" style={{ height: `${Math.max(pct, 2)}%` }}>
                        <div className="absolute bottom-0 left-0 right-0 rounded-t bg-blue-500 group-hover:bg-blue-600 transition-all" style={{ height: `${bp}%` }} />
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-400 group-hover:text-blue-600 transition-colors">{monthLabel(m.month)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <Legend color="bg-blue-500" label="Facturable" />
              <Legend color="bg-slate-200" label="Total" />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">Revenus</p>
            <div className="flex items-end gap-1 h-20">
              {data.monthlyBreakdown.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full relative" style={{ height: "72px" }}>
                    <div className="absolute bottom-0 left-0 right-0 rounded-t bg-emerald-500 transition-all" style={{ height: `${Math.max((m.revenue / maxR) * 100, 2)}%` }} />
                  </div>
                  <span className="text-[9px] text-slate-400">{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-slate-200 text-left">
                <th className="pb-2 font-medium text-slate-500">Mois</th>
                <th className="pb-2 font-medium text-slate-500 text-right">Heures</th>
                <th className="pb-2 font-medium text-slate-500 text-right">Facturable</th>
                <th className="pb-2 font-medium text-slate-500 text-right">Taux</th>
                <th className="pb-2 font-medium text-slate-500 text-right">Revenus</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.monthlyBreakdown.map((m) => {
                  const [y, mo] = m.month.split("-");
                  const from = `${y}-${mo}-01`;
                  const lastDay = new Date(parseInt(y), parseInt(mo), 0).getDate();
                  const to = `${y}-${mo}-${lastDay}`;
                  return (
                    <tr key={m.month} className="hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => window.open(`/billing?from=${from}&to=${to}`, "_self")}>
                      <td className="py-2 text-blue-600 font-medium hover:underline">{m.month}</td>
                      <td className="py-2 text-slate-600 text-right tabular-nums">{fmtHours(m.hours)}</td>
                      <td className="py-2 text-slate-600 text-right tabular-nums">{fmtHours(m.billableHours)}</td>
                      <td className="py-2 text-right tabular-nums"><span className={cn("font-medium", m.billableRate >= 70 ? "text-emerald-600" : m.billableRate >= 40 ? "text-amber-600" : "text-red-600")}>{m.billableRate}%</span></td>
                      <td className="py-2 text-slate-800 text-right tabular-nums font-medium">{fmtMoney(m.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarBreakdown({ title, icon, items, linkPrefix }: { title: string; icon: React.ReactNode; items: { key: string; label: string; count: number; color: string }[]; linkPrefix?: string }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">{icon} {title}</h3>
        {items.length > 0 ? (
          <div className="space-y-2.5">
            {items.sort((a, b) => b.count - a.count).map((i) => {
              const pct = total > 0 ? Math.round((i.count / total) * 100) : 0;
              const content = (
                <>
                  <span className={cn("text-[12px] text-slate-600 w-24 truncate", linkPrefix && "group-hover:text-blue-600 transition-colors")}>{i.label}</span>
                  <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", i.color)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[12px] font-bold text-slate-800 tabular-nums w-10 text-right">{i.count}</span>
                </>
              );
              return linkPrefix ? (
                <Link key={i.key} href={`${linkPrefix}${i.key.toLowerCase()}`} className="flex items-center gap-3 group rounded-lg px-1 -mx-1 py-0.5 hover:bg-slate-50 transition-colors cursor-pointer">
                  {content}
                </Link>
              ) : (
                <div key={i.key} className="flex items-center gap-3">{content}</div>
              );
            })}
          </div>
        ) : <p className="text-[12px] text-slate-400 py-4 text-center">Aucune donnée</p>}
      </CardContent>
    </Card>
  );
}

function AgentWidget({ data }: { data: ReportData }) {
  if (!data.agentBreakdown.length) return (
    <Card><CardContent className="p-5">
      <h3 className="text-[15px] font-semibold text-slate-900 mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-slate-500" /> Performance techniciens</h3>
      <p className="text-[12px] text-slate-400 py-6 text-center">Aucune donnée</p>
    </CardContent></Card>
  );
  const maxH = data.agentBreakdown[0]?.hours || 1;
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-slate-500" /> Performance techniciens</h3>
        <div className="space-y-3">
          {data.agentBreakdown.map((a) => (
            <Link key={a.agentName} href={`/billing?agent=${encodeURIComponent(a.agentName)}`} className="block group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {a.avatar ? (
                    <img src={a.avatar} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-slate-200" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[8px] font-bold">
                      {a.agentName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                  )}
                  <span className="text-[12px] font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{a.agentName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-emerald-600 font-medium">{a.resolved} résolus</span>
                  <span className="text-[12px] font-bold text-slate-800 tabular-nums">{fmtHours(a.hours)}</span>
                  <span className="text-[11px] text-emerald-700 tabular-nums font-medium w-20 text-right">{fmtMoney(a.revenue)}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(a.hours / maxH) * 100}%` }} />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CoverageWidget({ data }: { data: ReportData }) {
  const totalH = data.financeKpis.totalHours;
  if (!data.coverageBreakdown.length) return (
    <Card><CardContent className="p-5">
      <h3 className="text-[15px] font-semibold text-slate-900 mb-3 flex items-center gap-2"><Receipt className="h-4 w-4 text-slate-500" /> Répartition par couverture</h3>
      <p className="text-[12px] text-slate-400 py-6 text-center">Aucune donnée</p>
    </CardContent></Card>
  );
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2"><Receipt className="h-4 w-4 text-slate-500" /> Répartition par couverture</h3>
        <div className="space-y-2.5">
          {data.coverageBreakdown.map((c) => (
            <Link key={c.status} href={`/finances?tab=time&coverage=${c.status}`} className="flex items-center gap-3 group rounded-lg px-1 -mx-1 py-0.5 hover:bg-slate-50 transition-colors">
              <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", COVERAGE_COLORS[c.status] ?? "bg-slate-400")} />
              <span className="text-[12px] text-slate-700 flex-1 truncate group-hover:text-blue-600 transition-colors">{COVERAGE_LABELS[c.status] ?? c.status}</span>
              <span className="text-[11px] text-slate-500 tabular-nums w-12 text-right">{c.count}x</span>
              <span className="text-[12px] font-medium text-slate-600 tabular-nums w-14 text-right">{fmtHours(c.hours)}</span>
              <span className="text-[12px] font-bold text-slate-800 tabular-nums w-24 text-right">{fmtMoney(c.revenue)}</span>
            </Link>
          ))}
        </div>
        {totalH > 0 && (
          <div className="mt-4 h-3 rounded-full bg-slate-100 overflow-hidden flex">
            {data.coverageBreakdown.map((c) => (
              <div key={c.status} className={cn("h-full transition-all", COVERAGE_COLORS[c.status] ?? "bg-slate-400")} style={{ width: `${(c.hours / totalH) * 100}%` }} title={COVERAGE_LABELS[c.status] ?? c.status} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContractUsageWidget({ data }: { data: ReportData }) {
  if (!data.contractUsage.length) return (
    <Card><CardContent className="p-5">
      <h3 className="text-[15px] font-semibold text-slate-900 mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /> Utilisation des contrats</h3>
      <p className="text-[12px] text-slate-400 py-6 text-center">Aucun contrat actif</p>
    </CardContent></Card>
  );
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /> Utilisation des contrats</h3>
        <div className="space-y-4">
          {data.contractUsage.map((c) => (
            <div key={c.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-slate-900">{c.name}</span>
                  <Link href={`/organizations/${c.id}`} className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline">({c.organizationName})</Link>
                  <Badge variant="default" className="text-[9px]">{c.type}</Badge>
                </div>
                <div className="flex items-center gap-3 text-[12px]">
                  <span className="text-slate-500">{fmtHours(c.usedHours)} / {fmtHours(c.monthlyHours)}</span>
                  <span className={cn("font-bold tabular-nums", c.usagePercent >= 90 ? "text-red-600" : c.usagePercent >= 70 ? "text-amber-600" : "text-emerald-600")}>{c.usagePercent}%</span>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", c.usagePercent >= 90 ? "bg-red-500" : c.usagePercent >= 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(c.usagePercent, 100)}%` }} />
              </div>
              {c.usagePercent >= 90 && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-red-600">
                  <AlertTriangle className="h-3 w-3" />
                  {c.usagePercent >= 100 ? `Dépassement de ${fmtHours(c.usedHours - c.monthlyHours)}` : `Reste seulement ${fmtHours(c.remainingHours)}`}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TopTicketsWidget({ data }: { data: ReportData }) {
  if (!data.topTickets.length) return (
    <Card><CardContent className="p-5">
      <h3 className="text-[15px] font-semibold text-slate-900 mb-3 flex items-center gap-2"><Ticket className="h-4 w-4 text-slate-500" /> Top tickets par temps</h3>
      <p className="text-[12px] text-slate-400 py-6 text-center">Aucune donnée</p>
    </CardContent></Card>
  );
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2"><Ticket className="h-4 w-4 text-slate-500" /> Top tickets par temps investi</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50/60 text-left">
            <th className="px-4 py-3 font-medium text-slate-500">N°</th>
            <th className="px-4 py-3 font-medium text-slate-500">Sujet</th>
            <th className="px-4 py-3 font-medium text-slate-500">Client</th>
            <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
            <th className="px-4 py-3 font-medium text-slate-500 text-right">Heures</th>
            <th className="px-4 py-3 font-medium text-slate-500 text-right">Revenus</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.topTickets.map((t) => (
              <tr key={t.ticketNumber} className="hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => window.open(`/tickets/${t.ticketNumber}`, "_self")}>
                <td className="px-4 py-3 font-medium text-blue-600 tabular-nums hover:underline">#{t.ticketNumber}</td>
                <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{t.subject}</td>
                <td className="px-4 py-3 text-slate-500 text-[12px]">{t.organizationName}</td>
                <td className="px-4 py-3"><Badge variant="default" className="text-[10px]">{STATUS_LABELS[t.status] ?? t.status}</Badge></td>
                <td className="px-4 py-3 font-medium text-slate-800 tabular-nums text-right">{fmtHours(t.hours)}</td>
                <td className="px-4 py-3 font-bold text-emerald-700 tabular-nums text-right">{fmtMoney(t.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ===========================================================================
// Shared atoms
// ===========================================================================
function KpiCard({ label, value, trend, icon, bg, sub, href }: {
  label: string; value: string | number; trend?: number; icon: React.ReactNode; bg: string; sub?: string; href?: string;
}) {
  const inner = (
    <CardContent className={cn("flex items-center gap-3 p-4", href && "group-hover:bg-slate-50/80 transition-colors")}>
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", bg)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 truncate">{label}</p>
        <div className="flex items-center gap-1.5">
          <p className="text-lg font-bold text-slate-900 tabular-nums">{value}{sub && <span className="text-[12px] font-normal text-slate-400">{sub}</span>}</p>
          {trend !== undefined && trend !== 0 && (
            <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold", trend > 0 ? "text-emerald-600" : "text-red-600")}>
              {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
      </div>
      {href && <ExternalLink className="h-3 w-3 text-slate-300 group-hover:text-blue-400 ml-auto shrink-0 transition-colors" />}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href} className="group">
        <Card className="hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer">{inner}</Card>
      </Link>
    );
  }
  return <Card>{inner}</Card>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
      <div className={cn("h-2 w-2 rounded-full", color)} /> {label}
    </div>
  );
}

// ===========================================================================
// SidebarSection — wrapper réutilisable pour les sections de la sidebar
// dashboards (Favoris, Récents, Dossiers, Tous). Header cliquable pour
// collapse/expand, compteur à droite, actions optionnelles (rename/delete
// pour les dossiers), mode rename inline.
// ===========================================================================
function SidebarSection({
  title,
  icon,
  count,
  collapsed,
  onToggle,
  onTitleClick,
  isSelected,
  accentClass,
  hint,
  actions,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  onTitleClick?: () => void;
  isSelected?: boolean;
  accentClass?: string;
  hint?: string;
  actions?: React.ReactNode;
  renaming?: boolean;
  renameValue?: string;
  onRenameChange?: (v: string) => void;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
  children: React.ReactNode;
}) {
  // Si onTitleClick est fourni, la flèche gère expand/collapse et le reste
  // du header ouvre la vue dédiée (ex: galerie d'un dossier). Sinon le header
  // entier bascule collapsed (comportement historique).
  const splitHeader = !!onTitleClick;
  return (
    <div className="group">
      <div
        className={cn(
          "flex items-center gap-1 px-1 mb-0.5 rounded",
          isSelected && "bg-blue-50",
        )}
      >
        <button
          onClick={onToggle}
          className="h-6 w-6 shrink-0 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          disabled={renaming}
          title={collapsed ? "Développer" : "Réduire"}
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              collapsed && "-rotate-90",
            )}
          />
        </button>
        <button
          onClick={splitHeader ? onTitleClick : onToggle}
          className={cn(
            "flex-1 flex items-center gap-1.5 px-1 py-1 rounded transition-colors text-left",
            isSelected ? "hover:bg-blue-100" : "hover:bg-slate-50",
          )}
          disabled={renaming}
        >
          {icon}
          {renaming ? (
            <input
              autoFocus
              value={renameValue ?? ""}
              onChange={(e) => onRenameChange?.(e.target.value)}
              onBlur={() => onRenameCommit?.()}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameCommit?.();
                if (e.key === "Escape") onRenameCancel?.();
              }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex-1 bg-white border border-blue-300 rounded px-1 text-[11.5px] font-semibold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-200",
                accentClass,
              )}
            />
          ) : (
            <span
              className={cn(
                "flex-1 text-[11px] font-semibold uppercase tracking-wider truncate",
                isSelected ? "text-blue-700" : accentClass ?? "text-slate-500",
              )}
            >
              {title}
            </span>
          )}
          {typeof count === "number" && (
            <span className="text-[10px] tabular-nums text-slate-400">
              {count}
            </span>
          )}
        </button>
        {actions && !renaming && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {actions}
          </div>
        )}
      </div>
      {hint && !collapsed && (
        <p className="px-2 mb-1 text-[10px] italic text-slate-400">{hint}</p>
      )}
      {!collapsed && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

// ===========================================================================
// DashboardRow — ligne compacte d'un dashboard dans la sidebar avec :
//   - Icône état (étoile favori)
//   - Label + badge "Défaut" / hiérarchie
//   - Menu "⋯" pour favoris + ajout à un dossier + retrait
// ===========================================================================
function DashboardRow({
  report,
  isActive,
  isPrimary,
  isFav,
  folders,
  onOpen,
  onToggleFav,
  onAddToFolder,
  onRemoveFromFolder,
  dimmed,
  moveMenuOpen,
  setMoveMenuOpen,
}: {
  report: ReportDef;
  isActive: boolean;
  isPrimary: boolean;
  isFav: boolean;
  folders: DashboardFolder[];
  onOpen: () => void;
  onToggleFav: () => void;
  onAddToFolder: (folderId: string) => void;
  onRemoveFromFolder?: () => void;
  dimmed?: boolean;
  moveMenuOpen: boolean;
  setMoveMenuOpen: (open: boolean) => void;
}) {
  return (
    <div className="relative group/row">
      <button
        onClick={onOpen}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] text-left transition-all",
          isActive
            ? "bg-blue-50 text-blue-700 font-medium"
            : "text-slate-700 hover:bg-slate-50",
          dimmed && !isActive && "text-slate-400",
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          className={cn(
            "h-4 w-4 rounded flex items-center justify-center text-[12px] shrink-0 transition-all",
            isFav
              ? "text-amber-400 hover:text-amber-600"
              : "text-slate-300 opacity-0 group-hover/row:opacity-100 hover:text-amber-400",
          )}
          title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          {isFav ? "★" : "☆"}
        </button>
        <span className="flex-1 truncate">{report.label}</span>
        {isPrimary && (
          <span className="text-[8px] bg-blue-100 text-blue-600 rounded px-1 font-semibold uppercase shrink-0">
            Défaut
          </span>
        )}
        {report.parentId && (
          <span className="text-[9px] text-violet-500 shrink-0" title="Hérite d'un parent">
            ↳
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMoveMenuOpen(!moveMenuOpen);
          }}
          className="h-4 w-4 rounded flex items-center justify-center text-slate-400 hover:bg-slate-200 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
          title="Déplacer dans un dossier"
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      </button>
      {moveMenuOpen && (
        <div
          className="absolute right-1 top-8 z-20 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1"
          onMouseLeave={() => setMoveMenuOpen(false)}
        >
          <p className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Ajouter à un dossier
          </p>
          {folders.length === 0 ? (
            <p className="px-3 py-1.5 text-[11px] text-slate-500 italic">
              Aucun dossier — crée-en un avec le bouton 📁+ en haut.
            </p>
          ) : (
            folders.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  onAddToFolder(f.id);
                  setMoveMenuOpen(false);
                }}
                disabled={f.dashboardIds.includes(report.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11.5px] text-slate-700 hover:bg-slate-50 text-left disabled:text-slate-400 disabled:italic"
              >
                <Folder className="h-3 w-3 text-blue-500 shrink-0" />
                <span className="truncate">{f.name}</span>
                {f.dashboardIds.includes(report.id) && (
                  <span className="ml-auto text-[9px] text-slate-400">déjà dedans</span>
                )}
              </button>
            ))
          )}
          {onRemoveFromFolder && (
            <>
              <div className="h-px bg-slate-100 my-1" />
              <button
                onClick={() => {
                  onRemoveFromFolder();
                  setMoveMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11.5px] text-red-600 hover:bg-red-50 text-left"
              >
                <X className="h-3 w-3 shrink-0" />
                Retirer de ce dossier
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// PeriodPicker — sélecteur de période avancé pour le panneau Filtres.
// Combine presets glissants (7j/30j/...) + presets calendaires
// (aujourd'hui, YTD, mois dernier, trimestre dernier) + range custom.
// ===========================================================================
function PeriodPicker({
  days, setDays, customFrom, customTo, setCustomFrom, setCustomTo,
}: {
  days: string;
  setDays: (v: string) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
}) {
  const isCustom = days === "custom";

  // Presets glissants : expriment une durée relative à aujourd'hui.
  // `days` prend la valeur exacte en jours, ce qui est compatible avec
  // l'API existante (GET /reports/global?days=N).
  const rollingPresets = [
    { value: "7",   label: "7 jours" },
    { value: "30",  label: "30 jours" },
    { value: "90",  label: "3 mois" },
    { value: "180", label: "6 mois" },
    { value: "365", label: "1 an" },
  ];

  // Presets calendaires : on calcule à la volée le `days` équivalent
  // selon la date courante. Appliqués au clic, pas stockés comme
  // "YTD" car l'API ne comprend que jours glissants.
  const calendarPresets = [
    {
      key: "today",
      label: "Aujourd'hui",
      apply: () => { setDays("1"); },
    },
    {
      key: "current_week",
      label: "Semaine en cours",
      apply: () => {
        // Du lundi de la semaine courante jusqu'à aujourd'hui (inclus).
        const now = new Date();
        const day = now.getDay(); // 0 = dim, 1 = lun, …
        const mondayOffset = day === 0 ? 6 : day - 1;
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
        setCustomFrom(start.toISOString().slice(0, 10));
        setCustomTo(now.toISOString().slice(0, 10));
        setDays("custom");
      },
    },
    {
      key: "last_week",
      label: "Semaine dernière",
      apply: () => { setDays("7"); },
    },
    {
      key: "current_month",
      label: "Mois en cours",
      apply: () => {
        // Du 1er du mois courant jusqu'à aujourd'hui (inclus).
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        setCustomFrom(start.toISOString().slice(0, 10));
        setCustomTo(now.toISOString().slice(0, 10));
        setDays("custom");
      },
    },
    {
      key: "last_month",
      label: "Mois dernier",
      apply: () => {
        // Du 1er du mois dernier au dernier jour du mois dernier.
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endLast = new Date(now.getFullYear(), now.getMonth(), 0);
        setCustomFrom(lastMonth.toISOString().slice(0, 10));
        setCustomTo(endLast.toISOString().slice(0, 10));
        setDays("custom");
      },
    },
    {
      key: "last_quarter",
      label: "Trimestre dernier",
      apply: () => {
        const now = new Date();
        const currentQ = Math.floor(now.getMonth() / 3);
        const lastQStartMonth = currentQ === 0 ? 9 : (currentQ - 1) * 3;
        const lastQYear = currentQ === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const start = new Date(lastQYear, lastQStartMonth, 1);
        const end = new Date(lastQYear, lastQStartMonth + 3, 0);
        setCustomFrom(start.toISOString().slice(0, 10));
        setCustomTo(end.toISOString().slice(0, 10));
        setDays("custom");
      },
    },
    {
      key: "ytd",
      label: "Année en cours",
      apply: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const diffDays = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86_400_000));
        setDays(String(diffDays));
      },
    },
    {
      key: "last_year",
      label: "Année dernière",
      apply: () => {
        const now = new Date();
        const start = new Date(now.getFullYear() - 1, 0, 1);
        const end = new Date(now.getFullYear() - 1, 11, 31);
        setCustomFrom(start.toISOString().slice(0, 10));
        setCustomTo(end.toISOString().slice(0, 10));
        setDays("custom");
      },
    },
  ];

  return (
    <div className="space-y-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Période
      </label>

      {/* Presets glissants — grille compacte */}
      <div>
        <p className="mb-1.5 text-[10.5px] font-medium text-slate-500">Glissante (depuis aujourd'hui)</p>
        <div className="grid grid-cols-5 gap-1">
          {rollingPresets.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={cn(
                "rounded-lg py-2 text-[11px] font-medium transition-all",
                days === p.value && !isCustom
                  ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 ring-1 ring-slate-200",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Presets calendaires — liste de boutons pills */}
      <div>
        <p className="mb-1.5 text-[10.5px] font-medium text-slate-500">Calendaire</p>
        <div className="flex flex-wrap gap-1">
          {calendarPresets.map((p) => (
            <button
              key={p.key}
              onClick={p.apply}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Range personnalisé */}
      <div>
        <button
          onClick={() => setDays(isCustom ? "30" : "custom")}
          className={cn(
            "w-full text-left rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
            isCustom
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          {isCustom ? "✓ Plage personnalisée" : "Utiliser une plage personnalisée"}
        </button>
        {isCustom && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] font-medium text-slate-500 mb-0.5">Du</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12px] focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-medium text-slate-500 mb-0.5">Au</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12px] focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// ParentChildrenPanel — sélection d'un parent, puis cases à cocher pour
// attacher/détacher des dashboards enfants. Inverse de l'ancien flux où
// il fallait ouvrir chaque enfant pour lui choisir un parent.
//
// Règle : seuls les dashboards CUSTOM (id commence par "custom_") peuvent
// être attachés comme enfants (les built-in sont prédéfinis et ne
// supportent pas l'héritage). N'importe quel dashboard peut ÊTRE un
// parent. Les relations circulaires sont évitées côté UI (un candidat
// enfant ne peut pas être le parent actuel, ni avoir le parent comme
// descendant).
// ===========================================================================
function ParentChildrenPanel({
  allReports,
  getChildren,
  setReportParent,
  onClose,
  initialParentId,
}: {
  allReports: ReportDef[];
  getChildren: (id: string) => ReportDef[];
  setReportParent: (id: string, parentId: string | null) => void;
  onClose: () => void;
  initialParentId?: string;
}) {
  const [parentId, setParentId] = useState<string>(initialParentId ?? allReports[0]?.id ?? "");
  const [search, setSearch] = useState("");

  const parent = allReports.find((r) => r.id === parentId);

  // Candidats enfants : tous les dashboards CUSTOM sauf le parent
  // lui-même et sauf ceux dont attacher créerait un cycle (si le
  // parent est déjà dans leur chaîne descendante).
  function isDescendantOf(targetId: string, ancestorId: string, visited = new Set<string>()): boolean {
    if (visited.has(targetId)) return false;
    visited.add(targetId);
    const kids = getChildren(ancestorId);
    for (const k of kids) {
      if (k.id === targetId) return true;
      if (isDescendantOf(targetId, k.id, visited)) return true;
    }
    return false;
  }

  const candidates = allReports
    .filter((r) => r.id.startsWith("custom_"))
    .filter((r) => r.id !== parentId)
    .filter((r) => !isDescendantOf(parentId, r.id))
    .filter((r) => !search.trim() || r.label.toLowerCase().includes(search.toLowerCase().trim()));

  const currentChildIds = new Set(getChildren(parentId).map((c) => c.id));

  function toggleChild(childId: string, checked: boolean) {
    if (checked) {
      setReportParent(childId, parentId);
    } else {
      setReportParent(childId, null);
    }
  }

  function attachAll() {
    for (const c of candidates) {
      if (!currentChildIds.has(c.id)) setReportParent(c.id, parentId);
    }
  }

  function detachAll() {
    for (const id of currentChildIds) {
      setReportParent(id, null);
    }
  }

  return (
    <Card className="border-violet-200 bg-gradient-to-br from-violet-50/40 via-white to-white shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
              <GitBranch className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Relations parent → enfants</h3>
              <p className="text-[11.5px] text-slate-500 mt-0.5">
                Choisis un parent, puis coche les dashboards à attacher. Les enfants
                héritent automatiquement des widgets du parent.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* Sélecteur de parent */}
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Parent
            </label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allReports.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="inline-flex items-center gap-1.5">
                      {r.label}
                      {r.id.startsWith("custom_")
                        ? <span className="text-[9px] text-violet-500 uppercase tracking-wider">Custom</span>
                        : <span className="text-[9px] text-slate-400 uppercase tracking-wider">Prédéfini</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {parent && (
              <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2.5">
                <p className="text-[11px] text-violet-700 font-semibold uppercase tracking-wider">
                  Parent sélectionné
                </p>
                <p className="mt-0.5 text-[13px] font-semibold text-slate-900">{parent.label}</p>
                <p className="text-[11.5px] text-slate-600 leading-snug">{parent.description}</p>
                <p className="mt-2 text-[11px] text-violet-700">
                  {currentChildIds.size} enfant{currentChildIds.size !== 1 ? "s" : ""} actuellement attaché{currentChildIds.size !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>

          {/* Liste des enfants candidats */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                Enfants (dashboards custom)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={attachAll}
                  disabled={!parentId || candidates.length === 0 || candidates.every((c) => currentChildIds.has(c.id))}
                  className="text-[11px] text-blue-600 hover:text-blue-700 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
                >
                  Tout attacher
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={detachAll}
                  disabled={currentChildIds.size === 0}
                  className="text-[11px] text-red-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
                >
                  Tout détacher
                </button>
              </div>
            </div>
            <div className="mb-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un dashboard custom…"
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-[12px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white max-h-[420px] overflow-y-auto divide-y divide-slate-100">
              {candidates.length === 0 ? (
                <div className="p-5 text-center text-[12px] text-slate-400">
                  {search.trim()
                    ? "Aucun dashboard custom ne correspond à cette recherche."
                    : "Aucun dashboard custom disponible à attacher (crée-en d'abord via « Nouveau rapport »)."}
                </div>
              ) : (
                candidates.map((c) => {
                  const attached = currentChildIds.has(c.id);
                  const currentParent = c.parentId ? allReports.find((p) => p.id === c.parentId) : null;
                  const hasOtherParent = currentParent && currentParent.id !== parentId;
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                        attached ? "bg-violet-50/60 hover:bg-violet-50" : "hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={attached}
                        onChange={(e) => toggleChild(c.id, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "text-[13px] font-medium truncate",
                            attached ? "text-violet-900" : "text-slate-800",
                          )}>
                            {c.label}
                          </span>
                          {hasOtherParent && (
                            <span
                              className="text-[9.5px] rounded bg-amber-50 text-amber-700 px-1.5 py-0.5 ring-1 ring-inset ring-amber-200"
                              title={`Déjà attaché à ${currentParent?.label} — cocher ici le déplacera`}
                            >
                              Déjà attaché : {currentParent?.label}
                            </span>
                          )}
                        </div>
                        {c.description && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{c.description}</p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <p className="mt-2 text-[10.5px] text-slate-500">
              Coché = l'enfant hérite des widgets du parent. Si un dashboard est
              déjà attaché à un autre parent, cocher ici le réassignera.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
