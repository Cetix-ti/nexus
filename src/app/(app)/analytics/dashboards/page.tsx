"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Undo2,
  Redo2,
  Save,
  Folder,
  FolderPlus,
  Pencil,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  PieChart as RePieChart, Pie, Cell,
  ScatterChart as ReScatterChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Sankey, Tooltip as ReTooltip,
  XAxis, YAxis, CartesianGrid,
} from "recharts";

const PIE_PALETTE = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];
function pickPieColors(baseColor: string, count: number): string[] {
  const palette = [baseColor, ...PIE_PALETTE];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}
import { cn } from "@/lib/utils";
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
  | "projection";

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
}

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
function saveCustomReports(reports: ReportDef[]) { try { localStorage.setItem(CUSTOM_REPORTS_KEY, JSON.stringify(reports)); } catch {} }
function loadFolders(): DashboardFolder[] { try { const r = localStorage.getItem(FOLDERS_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveFolders(folders: DashboardFolder[]) { try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)); } catch {} }
function loadRecent(): string[] { try { const r = localStorage.getItem(RECENT_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveRecent(ids: string[]) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); } catch {} }
function loadCollapsedSections(): Record<string, boolean> { try { const r = localStorage.getItem(COLLAPSED_SECTIONS_KEY); if (r) return JSON.parse(r); } catch {} return {}; }
function saveCollapsedSections(s: Record<string, boolean>) { try { localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(s)); } catch {} }

// Valeur sentinelle pour la vue galerie (par défaut au landing). Évite un
// conflit avec un ID de rapport réel — commencer par "__" c'est safe.
const GALLERY_VIEW = "__gallery__";

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  // Page par défaut = galerie de dashboards (liste visuelle).
  // L'utilisateur peut ensuite pinner un dashboard en favori avec "défaut"
  // mais le landing reste la galerie pour plus de clarté.
  const [view, setView] = useState<string>(GALLERY_VIEW);
  const [showConfig, setShowConfig] = useState(false);
  const [showWidgetSidebar, setShowWidgetSidebar] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(() => loadVisible());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
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
  const [showCreateReport, setShowCreateReport] = useState(false);
  const [newReportName, setNewReportName] = useState("");
  const [newReportDesc, setNewReportDesc] = useState("");
  const [newReportWidgets, setNewReportWidgets] = useState<WidgetId[]>([]);
  const [newReportParentId, setNewReportParentId] = useState<string>("");
  const [showParentPanel, setShowParentPanel] = useState(false);
  // Sidebar repliée par défaut — libère l'espace pour la galerie/dashboard.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [folders, setFolders] = useState<DashboardFolder[]>(() => loadFolders());
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(
    () => loadCollapsedSections(),
  );
  // Menu "•••" pour déplacer un dashboard vers un dossier. Null = fermé.
  const [moveMenuForId, setMoveMenuForId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState("");

  // Merged catalog: built-in + custom
  const allReports = [...REPORT_CATALOG, ...customReports];

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

  // Dashboard items layout per report — persisted in localStorage
  const layoutKey = `nexus:report-layout:${view}`;
  const [dashItems, setDashItems] = useState<DashboardItem[]>([]);

  // Build dashboard items from report widgets when view changes
  useEffect(() => {
    const report = allReports.find((r) => r.id === view);
    if (!report) return;
    const widgets = resolveWidgets(report);
    // Try to load saved layout
    try {
      const saved = localStorage.getItem(layoutKey);
      if (saved) {
        const parsed = JSON.parse(saved) as DashboardItem[];
        if (parsed.length > 0) { setDashItems(parsed); return; }
      }
    } catch {}
    // Default: build from report widget list with sensible grid sizes
    const defaultW = (wId: string) => wId.includes("kpis") || wId.includes("trend") || wId.includes("org") || wId.includes("top_") || wId.includes("contract") || wId.includes("projection") ? 10 : 5;
    const defaultH = (wId: string) => wId.includes("kpis") ? 2 : wId.includes("trend") ? 5 : wId.includes("top_") ? 4 : 3;
    setDashItems(widgets.map((wId, i) => ({
      id: `di_${wId}_${i}`,
      widgetId: wId,
      w: defaultW(wId),
      h: defaultH(wId),
    })));
  }, [view, customReports]);

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

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/reports/global?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

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
    if (!view || view === GALLERY_VIEW) return;
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

  function setReportParent(reportId: string, parentId: string | null) {
    const updated = customReports.map((r) =>
      r.id === reportId ? { ...r, parentId } : r
    );
    setCustomReports(updated);
    saveCustomReports(updated.map((r) => ({ ...r, icon: null })));
    // Clear saved layout so it rebuilds from the new parent's widgets
    if (parentId) {
      try { localStorage.removeItem(`nexus:report-layout:${reportId}`); } catch {}
    }
  }

  function deleteReport(id: string) {
    if (!id.startsWith("custom_")) return;
    if (!confirm("Supprimer ce rapport personnalisé ?")) return;
    // Detach children: remove parentId reference
    const updated = customReports
      .filter((r) => r.id !== id)
      .map((r) => r.parentId === id ? { ...r, parentId: null } : r);
    setCustomReports(updated);
    saveCustomReports(updated.map((r) => ({ ...r, icon: null })));
    setFavorites((prev) => { const next = prev.filter((f) => f !== id); saveFavorites(next); return next; });
    if (view === id) setView(loadPrimary());
    try { localStorage.removeItem(`nexus:report-layout:${id}`); } catch {}
  }

  function toggleWidget(id: WidgetId) {
    setVisibleWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      saveVisible(next);
      return next;
    });
  }

  // Global filters
  const [filterOrg, setFilterOrg] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

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
    <div className="flex gap-3 min-h-0">
      {/* ============================================================ */}
      {/* Left sidebar — dashboard list */}
      {/* ============================================================ */}
      <div className={cn(
        "hidden md:flex shrink-0 flex-col gap-3 print:hidden transition-all duration-200",
        // Collapsed = 36 px (bouton + mini-icônes favoris). Expanded : largeur
        // plus généreuse (240/288 px) pour que les noms de dossiers et de
        // dashboards soient bien lisibles sans truncate agressif.
        sidebarCollapsed ? "w-9" : "md:w-60 lg:w-72"
      )}>
        {sidebarCollapsed ? (
          /* Collapsed sidebar — just a thin bar with expand button */
          <Card className="py-2 flex flex-col items-center gap-1">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              title="Ouvrir le panneau"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <div className="w-5 h-px bg-slate-200 my-1" />
            {/* Mini icons for active report hint */}
            {favorites.slice(0, 6).map((fId) => {
              const r = allReports.find((rep) => rep.id === fId);
              if (!r) return null;
              const isActive = view === fId;
              return (
                <button
                  key={fId}
                  onClick={() => setView(fId)}
                  className={cn(
                    "h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold transition-all",
                    isActive
                      ? "bg-blue-100 text-blue-700"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  )}
                  title={r.label}
                >
                  {r.label.charAt(0)}
                </button>
              );
            })}
          </Card>
        ) : (
          /* Expanded sidebar */
          <Card className="overflow-hidden">
            <div className="px-3 pt-3 pb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-slate-900">Dashboards</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={addFolder}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                  title="Nouveau dossier"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setShowCreateReport(true)}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Nouveau dashboard"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  title="Réduire le panneau"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-180px)] px-1.5 pb-2 space-y-2">
              {/* Lien permanent vers la galerie. */}
              <button
                onClick={() => setView(GALLERY_VIEW)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] text-left transition-all",
                  view === GALLERY_VIEW
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">Galerie</span>
              </button>

              {/* Mes Favoris — toujours en tête, fixe */}
              <SidebarSection
                title="Mes Favoris"
                icon={<span className="text-[11px] text-amber-500">★</span>}
                count={favorites.length}
                collapsed={!!collapsedSections["__fav__"]}
                onToggle={() => toggleSection("__fav__")}
                accentClass="text-amber-500"
              >
                {favorites.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] text-slate-400 italic">
                    Clique ☆ sur un dashboard pour l&apos;ajouter ici.
                  </p>
                ) : (
                  favorites.map((fId) => {
                    const r = allReports.find((rep) => rep.id === fId);
                    if (!r) return null;
                    return (
                      <DashboardRow
                        key={`fav-${fId}`}
                        report={r}
                        isActive={view === fId}
                        isPrimary={primaryId === fId}
                        isFav={true}
                        folders={folders}
                        onOpen={() => setView(fId)}
                        onToggleFav={() => toggleFavorite(fId)}
                        onAddToFolder={(folderId) => addDashboardToFolder(folderId, fId)}
                        moveMenuOpen={moveMenuForId === `fav-${fId}`}
                        setMoveMenuOpen={(open) =>
                          setMoveMenuForId(open ? `fav-${fId}` : null)
                        }
                      />
                    );
                  })
                )}
              </SidebarSection>

              {/* Récents — 5 derniers consultés */}
              <SidebarSection
                title="Récents"
                icon={<Clock className="h-3 w-3 text-slate-400" />}
                count={recent.length}
                collapsed={!!collapsedSections["__recent__"]}
                onToggle={() => toggleSection("__recent__")}
                accentClass="text-slate-500"
              >
                {recent.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] text-slate-400 italic">
                    Tes derniers dashboards consultés apparaîtront ici.
                  </p>
                ) : (
                  recent.map((rId) => {
                    const r = allReports.find((rep) => rep.id === rId);
                    if (!r) return null;
                    return (
                      <DashboardRow
                        key={`rec-${rId}`}
                        report={r}
                        isActive={view === rId}
                        isPrimary={primaryId === rId}
                        isFav={favorites.includes(rId)}
                        folders={folders}
                        onOpen={() => setView(rId)}
                        onToggleFav={() => toggleFavorite(rId)}
                        onAddToFolder={(folderId) => addDashboardToFolder(folderId, rId)}
                        moveMenuOpen={moveMenuForId === `rec-${rId}`}
                        setMoveMenuOpen={(open) =>
                          setMoveMenuForId(open ? `rec-${rId}` : null)
                        }
                      />
                    );
                  })
                )}
              </SidebarSection>

              {/* Dossiers créés par l'utilisateur */}
              {folders.map((folder) => {
                const key = `folder:${folder.id}`;
                const isRenaming = renamingFolderId === folder.id;
                return (
                  <SidebarSection
                    key={folder.id}
                    title={folder.name}
                    icon={<Folder className="h-3 w-3 text-blue-500" />}
                    count={folder.dashboardIds.length}
                    collapsed={!!collapsedSections[key]}
                    onToggle={() => toggleSection(key)}
                    accentClass="text-blue-500"
                    renaming={isRenaming}
                    renameValue={renameFolderDraft}
                    onRenameChange={setRenameFolderDraft}
                    onRenameCommit={() => {
                      renameFolder(folder.id, renameFolderDraft);
                      setRenamingFolderId(null);
                    }}
                    onRenameCancel={() => setRenamingFolderId(null)}
                    actions={
                      <>
                        <button
                          onClick={() => {
                            setRenamingFolderId(folder.id);
                            setRenameFolderDraft(folder.name);
                          }}
                          className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Renommer"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => deleteFolder(folder.id)}
                          className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Supprimer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    }
                  >
                    {folder.dashboardIds.length === 0 ? (
                      <p className="px-2 py-1 text-[11px] text-slate-400 italic">
                        Dossier vide. Utilise ⋯ sur un dashboard pour l&apos;ajouter.
                      </p>
                    ) : (
                      folder.dashboardIds.map((dId) => {
                        const r = allReports.find((rep) => rep.id === dId);
                        if (!r) return null;
                        return (
                          <DashboardRow
                            key={`${folder.id}-${dId}`}
                            report={r}
                            isActive={view === dId}
                            isPrimary={primaryId === dId}
                            isFav={favorites.includes(dId)}
                            folders={folders}
                            onOpen={() => setView(dId)}
                            onToggleFav={() => toggleFavorite(dId)}
                            onAddToFolder={(folderId) => addDashboardToFolder(folderId, dId)}
                            onRemoveFromFolder={() => removeDashboardFromFolder(folder.id, dId)}
                            moveMenuOpen={moveMenuForId === `${folder.id}-${dId}`}
                            setMoveMenuOpen={(open) =>
                              setMoveMenuForId(open ? `${folder.id}-${dId}` : null)
                            }
                          />
                        );
                      })
                    )}
                  </SidebarSection>
                );
              })}

              {/* Tous les dashboards (non classés + tous, pour découvrir) */}
              {(() => {
                const foldered = new Set(folders.flatMap((f) => f.dashboardIds));
                const unfiledCount = allReports.filter((r) => !foldered.has(r.id)).length;
                return (
                  <SidebarSection
                    title="Tous les dashboards"
                    icon={<LayoutDashboard className="h-3 w-3 text-slate-400" />}
                    count={allReports.length}
                    collapsed={collapsedSections["__all__"] ?? true}
                    onToggle={() => toggleSection("__all__")}
                    accentClass="text-slate-500"
                    hint={
                      unfiledCount > 0
                        ? `${unfiledCount} non classé${unfiledCount > 1 ? "s" : ""}`
                        : undefined
                    }
                  >
                    {allReports.map((r) => {
                      const inFolder = foldered.has(r.id);
                      return (
                        <DashboardRow
                          key={`all-${r.id}`}
                          report={r}
                          isActive={view === r.id}
                          isPrimary={primaryId === r.id}
                          isFav={favorites.includes(r.id)}
                          folders={folders}
                          onOpen={() => setView(r.id)}
                          onToggleFav={() => toggleFavorite(r.id)}
                          onAddToFolder={(folderId) => addDashboardToFolder(folderId, r.id)}
                          dimmed={inFolder}
                          moveMenuOpen={moveMenuForId === `all-${r.id}`}
                          setMoveMenuOpen={(open) =>
                            setMoveMenuForId(open ? `all-${r.id}` : null)
                          }
                        />
                      );
                    })}
                  </SidebarSection>
                );
              })()}
            </div>
          </Card>
        )}
      </div>

      {/* ============================================================ */}
      {/* Main content */}
      {/* ============================================================ */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
                {view === GALLERY_VIEW
                  ? "Galerie de tableaux de bord"
                  : activeReport
                    ? activeReport.label
                    : "Dashboards"}
              </h1>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {view === GALLERY_VIEW
                  ? `${allReports.length} tableau${allReports.length > 1 ? "x" : ""} de bord disponibles — clique pour ouvrir`
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
              <button
                onClick={() => toggleFavorite(activeReport.id)}
                className={cn(
                  "mt-0.5 h-9 w-9 rounded-lg flex items-center justify-center text-[20px] transition-all ring-1 ring-inset",
                  favorites.includes(activeReport.id)
                    ? "text-amber-500 ring-amber-200 bg-amber-50 hover:bg-amber-100"
                    : "text-slate-300 ring-slate-200 bg-white hover:text-amber-400 hover:ring-amber-200 hover:bg-amber-50"
                )}
                title={favorites.includes(activeReport.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                {favorites.includes(activeReport.id) ? "★" : "☆"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Les actions "sur dashboard" (filtres, edit, parenté, print)
                n'ont pas de sens sur la galerie — on les masque quand
                aucun dashboard n'est sélectionné. */}
            {view !== GALLERY_VIEW && (
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
                  <Button variant="outline" size="sm" onClick={enterEditMode}>
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Éditer
                  </Button>
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
                <Button variant="ghost" size="sm" onClick={() => window.print()} title="Imprimer">
                  <Printer className="h-3.5 w-3.5" />
                </Button>
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
            <Button variant="primary" size="sm" onClick={() => setShowCreateReport(true)} className="hidden md:inline-flex">
              <Plus className="h-3.5 w-3.5" />
              Nouveau
            </Button>
          </div>
        </div>

      {/* ============================================================ */}
      {/* Parent/child management panel */}
      {/* ============================================================ */}
      {showParentPanel && (
        <Card className="border-violet-200 bg-violet-50/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-violet-600" />
                <h3 className="text-[15px] font-semibold text-slate-900">Relations parent / enfant</h3>
              </div>
              <button onClick={() => setShowParentPanel(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-[12px] text-slate-500">
              Un dashboard enfant hérite automatiquement des widgets de son parent. Modifiez les relations ci-dessous.
            </p>
            <div className="space-y-1">
              {allReports.map((r) => {
                const parentReport = r.parentId ? allReports.find((p) => p.id === r.parentId) : null;
                const children = getChildren(r.id);
                const isCustom = r.id.startsWith("custom_");
                return (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[12.5px] font-medium truncate", view === r.id ? "text-blue-700" : "text-slate-800")}>{r.label}</span>
                        {parentReport && (
                          <span className="text-[10px] bg-violet-100 text-violet-600 rounded px-1.5 py-0.5 shrink-0">
                            ↳ {parentReport.label}
                          </span>
                        )}
                        {children.length > 0 && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 shrink-0">
                            {children.length} enfant{children.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    {isCustom ? (
                      <Select
                        value={r.parentId || "_none"}
                        onValueChange={(v) => setReportParent(r.id, v === "_none" ? null : v)}
                      >
                        <SelectTrigger className="w-48 h-8 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Aucun parent</SelectItem>
                          {allReports
                            .filter((p) => p.id !== r.id && p.parentId !== r.id)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Prédéfini</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {WIDGETS.map((w) => {
                    const selected = newReportWidgets.includes(w.id);
                    return (
                      <button key={w.id} onClick={() => setNewReportWidgets((prev) => selected ? prev.filter((id) => id !== w.id) : [...prev, w.id])}
                        className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-all ring-1 ring-inset text-[11px]",
                          selected ? "bg-blue-50 ring-blue-200 text-blue-700 font-medium" : "bg-white ring-slate-200 text-slate-600 hover:ring-blue-200"
                        )}>
                        {w.icon}
                        <span className="truncate">{w.label}</span>
                      </button>
                    );
                  })}
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

              {/* Period */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Période</label>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { value: "7", label: "7j" },
                    { value: "30", label: "30j" },
                    { value: "90", label: "3m" },
                    { value: "180", label: "6m" },
                    { value: "365", label: "12m" },
                  ].map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setDays(p.value)}
                      className={cn(
                        "rounded-lg py-2 text-[12px] font-medium transition-all",
                        days === p.value
                          ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100 ring-1 ring-slate-200"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

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
      {/* Galerie — page par défaut : grille visuelle des dashboards */}
      {/* ============================================================ */}
      {view === GALLERY_VIEW && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Bouton "Nouveau dashboard" en première case */}
          <button
            type="button"
            onClick={() => setShowCreateReport(true)}
            className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 hover:bg-blue-50/60 hover:border-blue-400 transition-all p-6 min-h-[160px]"
          >
            <div className="h-11 w-11 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
              <Plus className="h-5 w-5 text-slate-500 group-hover:text-blue-700" />
            </div>
            <p className="text-[13px] font-semibold text-slate-700 group-hover:text-blue-700">
              Créer un dashboard
            </p>
            <p className="text-[11.5px] text-slate-500 text-center">
              Assemble tes widgets favoris
            </p>
          </button>

          {allReports.map((r) => {
            const isPrimary = r.id === primaryId;
            const isFav = favorites.includes(r.id);
            const widgetCount = resolveWidgets(r).length;
            const childCount = getChildren(r.id).length;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setView(r.id)}
                className="group relative flex flex-col text-left rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-blue-300 hover:shadow-[0_8px_24px_-8px_rgba(37,99,235,0.18)] transition-all p-5 min-h-[160px]"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    {r.icon}
                  </div>
                  <div className="flex items-center gap-1">
                    {isFav && (
                      <span className="text-amber-500 text-[14px]" title="Favori">
                        ★
                      </span>
                    )}
                    {isPrimary && (
                      <span className="text-[8.5px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
                        Défaut
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="text-[14px] font-semibold text-slate-900 leading-tight mb-1.5 group-hover:text-blue-700 transition-colors">
                  {r.label}
                </h3>
                <p className="text-[11.5px] text-slate-500 leading-relaxed line-clamp-2 mb-3">
                  {r.description}
                </p>
                <div className="mt-auto flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                    {widgetCount} widget{widgetCount > 1 ? "s" : ""}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10.5px] font-medium text-slate-500 capitalize">
                    {r.category}
                  </span>
                  {childCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-medium text-violet-700">
                      {childCount} enfant{childCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {r.parentId && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-medium text-violet-700"
                      title="Hérite d'un parent"
                    >
                      ↳
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* Dashboard / Report widgets — drag-and-drop grid */}
      {/* ============================================================ */}
      {activeReport && (
        <>
          {loading && !data && (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          )}

          {!loading && dashItems.length === 0 && (
            <Card><CardContent className="p-12 text-center">
              <LayoutDashboard className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-[15px] font-semibold text-slate-900">Aucun widget dans ce rapport</h3>
              <p className="mt-1 text-[13px] text-slate-500">Cliquez sur « Éditer » puis ajoutez des widgets.</p>
            </CardContent></Card>
          )}

          {data && dashItems.length > 0 && (
            <DashboardGrid
              items={dashItems}
              editMode={editMode}
              onReorder={handleGridReorder}
              onRemove={handleGridRemove}
              onResize={handleGridResize}
              onAddClick={() => setShowWidgetSidebar(true)}
              renderWidget={(widgetId: string, w: number, h: number) => {
                // Adapt grid columns based on widget width
                const isNarrow = w <= 4;
                const isWide = w >= 8;
                const kpiCols = isNarrow ? "grid-cols-2" : isWide ? "grid-cols-3 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3";

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
                  default:
                    return <QueryWidgetRenderer widgetId={widgetId} />;
                }
              }}
            />
          )}
        </>
      )}

      {/* Widget sidebar — built-in + custom widgets */}
      {showWidgetSidebar && (
        <WidgetAddPanel
          dashItems={dashItems}
          onAdd={handleGridAdd}
          onClose={() => setShowWidgetSidebar(false)}
        />
      )}
      </div>
    </div>
  );
}

// ===========================================================================
// Query widget renderer — loads & executes a custom widget's query
// ===========================================================================
function QueryWidgetRenderer({ widgetId }: { widgetId: string }) {
  const [result, setResult] = useState<{ label: string; value: number }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [widget, setWidget] = useState<QueryWidget | null>(null);

  useEffect(() => {
    const widgets = loadQueryWidgets();
    const w = widgets.find((x) => x.id === widgetId);
    if (!w) { setLoading(false); return; }
    setWidget(w);
    fetch("/api/v1/analytics/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(w.query),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.results) setResult(d.results); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [widgetId]);

  if (loading) return <Card><CardContent className="p-5 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></CardContent></Card>;
  if (!widget) return <Card><CardContent className="p-5 text-center text-slate-400 text-[13px]">Widget « {widgetId} » introuvable</CardContent></Card>;
  if (!result) return <Card><CardContent className="p-5 text-center text-slate-400 text-[13px]">Aucune donnée</CardContent></Card>;

  const color = widget.color || "#2563eb";
  const maxVal = Math.max(...result.map((r) => r.value), 1);
  const isSingle = result.length === 1 && result[0].label === "Total";

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold text-slate-500 mb-2">{widget.name}</p>
        {(widget.chartType === "number" || isSingle) ? (
          <div className="text-center py-2">
            <p className="text-3xl font-bold tabular-nums" style={{ color }}>{result[0]?.value?.toLocaleString("fr-CA") ?? "—"}</p>
          </div>
        ) : widget.chartType === "bar" ? (
          <div className="flex items-end gap-1 h-24">
            {result.map((r, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative" style={{ height: "80px" }}>
                  <div className="absolute bottom-0 left-0 right-0 rounded-t" style={{ height: `${Math.max((r.value / maxVal) * 100, 4)}%`, backgroundColor: color }} />
                </div>
                <span className="text-[8px] text-slate-400 truncate max-w-full text-center">{r.label}</span>
              </div>
            ))}
          </div>
        ) : widget.chartType === "horizontal_bar" ? (
          <div className="space-y-1.5">
            {result.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 w-24 truncate">{r.label}</span>
                <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(r.value / maxVal) * 100}%`, backgroundColor: color }} />
                </div>
                <span className="text-[10px] font-bold tabular-nums w-14 text-right">{r.value.toLocaleString("fr-CA")}</span>
              </div>
            ))}
          </div>
        ) : widget.chartType === "line" ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={result} margin={{ top: 5, right: 10, left: 0, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <ReTooltip />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : widget.chartType === "area" ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={result} margin={{ top: 5, right: 10, left: 0, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <ReTooltip />
              <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        ) : widget.chartType === "pie" || widget.chartType === "donut" ? (
          <ResponsiveContainer width="100%" height={200}>
            <RePieChart>
              <Pie
                data={result}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={70}
                innerRadius={widget.chartType === "donut" ? 40 : 0}
                label={(e: any) => `${e.label}`}
                labelLine={false}
              >
                {result.map((_, i) => (
                  <Cell key={i} fill={pickPieColors(color, result.length)[i]} />
                ))}
              </Pie>
              <ReTooltip />
            </RePieChart>
          </ResponsiveContainer>
        ) : widget.chartType === "scatter" ? (
          <ResponsiveContainer width="100%" height={200}>
            <ReScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} />
              <YAxis dataKey="y" tick={{ fontSize: 10 }} />
              <ReTooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={result.map((r, i) => ({ x: i + 1, y: r.value, label: r.label }))} fill={color} />
            </ReScatterChart>
          </ResponsiveContainer>
        ) : widget.chartType === "radar" ? (
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={result}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="label" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fontSize: 9 }} />
              <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.4} />
              <ReTooltip />
            </RadarChart>
          </ResponsiveContainer>
        ) : widget.chartType === "sankey" ? (
          <ResponsiveContainer width="100%" height={220}>
            <Sankey
              data={{
                nodes: [{ name: "Total" }, ...result.map((r) => ({ name: r.label }))],
                links: result.map((r, i) => ({ source: 0, target: i + 1, value: r.value || 1 })),
              }}
              nodePadding={20}
              nodeWidth={12}
              link={{ stroke: color, strokeOpacity: 0.4 }}
              node={{ stroke: color, fill: color } as any}
            >
              <ReTooltip />
            </Sankey>
          </ResponsiveContainer>
        ) : (
          <div className="space-y-1">
            {result.map((r, i) => (
              <div key={i} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                <span className="text-[11px] text-slate-700">{r.label}</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{r.value.toLocaleString("fr-CA")}</span>
              </div>
            ))}
          </div>
        )}
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

function WidgetAddPanel({ dashItems, onAdd, onClose }: {
  dashItems: DashboardItem[];
  onAdd: (widgetId: string) => void;
  onClose: () => void;
}) {
  const [queryWidgets] = useState<QueryWidget[]>(() => loadQueryWidgets());

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex print:hidden">
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative ml-auto w-[380px] max-w-[90vw] h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">Ajouter des widgets</h2>
              <p className="text-[11px] text-slate-500">{dashItems.length} widgets actuellement</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Built-in widgets */}
          <div>
            <p className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Widgets prédéfinis</p>
            <div className="space-y-1.5">
              {WIDGETS.map((w) => {
                const alreadyUsed = dashItems.some((di) => di.widgetId === w.id);
                return (
                  <div key={w.id} className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ring-1 ring-inset",
                    alreadyUsed ? "bg-emerald-50/30 ring-emerald-200/60" : "bg-white ring-slate-200/60 hover:ring-blue-200 hover:bg-blue-50/20"
                  )}>
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      alreadyUsed ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                    )}>
                      {w.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-slate-800 truncate">{w.label}</p>
                      <p className="text-[10px] text-slate-500 truncate">{w.description}</p>
                    </div>
                    {alreadyUsed ? (
                      <span className="text-[10px] text-emerald-600 font-medium shrink-0">Actif</span>
                    ) : (
                      <button onClick={() => onAdd(w.id)}
                        className="shrink-0 h-7 w-7 rounded-md bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* User query-builder widgets */}
          {queryWidgets.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Mes widgets ({queryWidgets.length})</p>
                <Link href="/analytics/widgets" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                  Gérer
                </Link>
              </div>
              <div className="space-y-1.5">
                {queryWidgets.map((w) => {
                  const alreadyUsed = dashItems.some((di) => di.widgetId === w.id);
                  return (
                    <div key={w.id} className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ring-1 ring-inset",
                      alreadyUsed ? "bg-emerald-50/30 ring-emerald-200/60" : "bg-white ring-slate-200/60 hover:ring-blue-200 hover:bg-blue-50/20"
                    )}>
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      )} style={{ backgroundColor: (alreadyUsed ? "#05966920" : w.color + "20") }}>
                        <BarChart3 className="h-4 w-4" style={{ color: alreadyUsed ? "#059669" : w.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-800 truncate">{w.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{w.description}</p>
                      </div>
                      {alreadyUsed ? (
                        <span className="text-[10px] text-emerald-600 font-medium shrink-0">Actif</span>
                      ) : (
                        <button onClick={() => onAdd(w.id)}
                          className="shrink-0 h-7 w-7 rounded-md bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {queryWidgets.length === 0 && (
            <div className="text-center py-4">
              <p className="text-[12px] text-slate-400 mb-2">Aucun widget personnalisé</p>
              <Link href="/analytics/widgets" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                Créer dans l&apos;éditeur de widgets
              </Link>
            </div>
          )}
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
  return (
    <div className="group">
      <div className="flex items-center gap-1 px-1 mb-0.5">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-1.5 px-1 py-1 rounded hover:bg-slate-50 transition-colors text-left"
          disabled={renaming}
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 text-slate-400 transition-transform shrink-0",
              collapsed && "-rotate-90",
            )}
          />
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
                accentClass ?? "text-slate-500",
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
