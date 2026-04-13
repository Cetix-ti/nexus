"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WidgetSidebar } from "@/components/widgets/widget-sidebar";
import { DashboardGrid, type DashboardItem } from "@/components/widgets/dashboard-grid";
import { useWidgetStore } from "@/stores/widget-store";
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
  Settings,
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
} from "lucide-react";
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
function loadFavorites(): string[] { try { const r = localStorage.getItem(FAV_KEY); if (r) return JSON.parse(r); } catch {} return ["full_report", "monthly_billing", "ticket_overview"]; }
function saveFavorites(ids: string[]) { try { localStorage.setItem(FAV_KEY, JSON.stringify(ids)); } catch {} }
function loadPrimary(): string { try { return localStorage.getItem(PRIMARY_KEY) || "full_report"; } catch { return "full_report"; } }
function savePrimary(id: string) { try { localStorage.setItem(PRIMARY_KEY, id); } catch {} }
function loadCustomReports(): ReportDef[] { try { const r = localStorage.getItem(CUSTOM_REPORTS_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveCustomReports(reports: ReportDef[]) { try { localStorage.setItem(CUSTOM_REPORTS_KEY, JSON.stringify(reports)); } catch {} }

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  // Start on the primary dashboard directly
  const [view, setView] = useState<string>(() => loadPrimary());
  const [showConfig, setShowConfig] = useState(false);
  const [showWidgetSidebar, setShowWidgetSidebar] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(() => loadVisible());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [primaryId, setPrimaryId] = useState<string>(() => loadPrimary());
  const [showAllReports, setShowAllReports] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [customReports, setCustomReports] = useState<ReportDef[]>(() => loadCustomReports());
  const [showCreateReport, setShowCreateReport] = useState(false);
  const [newReportName, setNewReportName] = useState("");
  const [newReportDesc, setNewReportDesc] = useState("");
  const [newReportWidgets, setNewReportWidgets] = useState<WidgetId[]>([]);

  // Merged catalog: built-in + custom
  const allReports = [...REPORT_CATALOG, ...customReports];

  // Dashboard items layout per report — persisted in localStorage
  const layoutKey = `nexus:report-layout:${view}`;
  const [dashItems, setDashItems] = useState<DashboardItem[]>([]);

  // Build dashboard items from report widgets when view changes
  useEffect(() => {
    const report = REPORT_CATALOG.find((r) => r.id === view);
    if (!report) return;
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
    setDashItems(report.widgets.map((wId, i) => ({
      id: `di_${wId}_${i}`,
      widgetId: wId,
      w: defaultW(wId),
      h: defaultH(wId),
    })));
  }, [view]);

  function saveDashLayout(items: DashboardItem[]) {
    setDashItems(items);
    try { localStorage.setItem(layoutKey, JSON.stringify(items)); } catch {}
  }

  function handleGridReorder(items: DashboardItem[]) { saveDashLayout(items); }
  function handleGridRemove(id: string) { saveDashLayout(dashItems.filter((i) => i.id !== id)); }
  function handleGridResize(id: string, w: number, h: number) { saveDashLayout(dashItems.map((i) => i.id === id ? { ...i, w, h } : i)); }
  function handleGridAdd(widgetId: string) {
    const newItem: DashboardItem = { id: `di_${widgetId}_${Date.now()}`, widgetId, w: 10, h: 3 };
    saveDashLayout([...dashItems, newItem]);
  }

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

  function createReport() {
    if (!newReportName.trim()) return;
    const id = `custom_${Date.now()}`;
    const report: ReportDef = {
      id,
      label: newReportName.trim(),
      description: newReportDesc.trim() || "Rapport personnalisé",
      icon: <BarChart3 className="h-5 w-5 text-blue-600" />,
      category: "complet",
      widgets: newReportWidgets.length > 0 ? newReportWidgets : ["ticket_kpis", "finance_kpis"],
    };
    const updated = [...customReports, report];
    setCustomReports(updated);
    saveCustomReports(updated.map((r) => ({ ...r, icon: null })));
    setShowCreateReport(false);
    setNewReportName("");
    setNewReportDesc("");
    setNewReportWidgets([]);
    setView(id);
    setFavorites((prev) => { const next = [...prev, id]; saveFavorites(next); return next; });
  }

  function deleteReport(id: string) {
    if (!id.startsWith("custom_")) return;
    if (!confirm("Supprimer ce rapport personnalisé ?")) return;
    const updated = customReports.filter((r) => r.id !== id);
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
  const displayWidgets = activeReport ? activeReport.widgets : visibleWidgets;
  const isVis = (id: WidgetId) => displayWidgets.includes(id);

  const tk = data?.ticketKpis;
  const fk = data?.financeKpis;
  const fd = filteredData; // Use filtered data for widgets

  return (
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* Header */}
      {/* ============================================================ */}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Dashboards</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">
            {activeReport ? activeReport.description : "Tableaux de bord interactifs"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 jours</SelectItem>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="90">3 mois</SelectItem>
              <SelectItem value="180">6 mois</SelectItem>
              <SelectItem value="365">12 mois</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={showFilters ? "primary" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-3.5 w-3.5" />
            Filtres
            {(filterOrg !== "all" || filterAgent !== "all") && (
              <span className="ml-1 h-4 min-w-[16px] rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center px-1">
                {(filterOrg !== "all" ? 1 : 0) + (filterAgent !== "all" ? 1 : 0)}
              </span>
            )}
          </Button>
          <Button variant={editMode ? "primary" : "outline"} size="sm" onClick={() => setEditMode(!editMode)}>
            <LayoutDashboard className="h-3.5 w-3.5" />
            {editMode ? "Terminer" : "Éditer"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()} title="Imprimer">
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreateReport(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nouveau dashboard
          </Button>
        </div>
      </div>

      {/* Favorites bar + report dropdown */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {/* Favorite tabs */}
        {favorites.map((fId) => {
          const r = allReports.find((rep) => rep.id === fId);
          if (!r) return null;
          const isActive = view === fId;
          const isPrimary = primaryId === fId;
          return (
            <button
              key={fId}
              onClick={() => setView(fId)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-all ring-1 ring-inset shrink-0",
                isActive
                  ? "bg-blue-50 text-blue-700 ring-blue-200 shadow-sm"
                  : "bg-white text-slate-600 ring-slate-200/60 hover:ring-blue-200 hover:bg-blue-50/30"
              )}
            >
              {isPrimary && <span className="text-[10px]">★</span>}
              {r.label}
            </button>
          );
        })}

        {/* Separator */}
        <div className="h-6 w-px bg-slate-200 shrink-0 mx-1" />

        {/* Dropdown for all reports */}
        <div className="relative shrink-0">
          <Select value={view} onValueChange={(v) => { setView(v); setShowAllReports(false); }}>
            <SelectTrigger className="w-52 h-9 text-[12px]">
              <SelectValue placeholder="Autres rapports..." />
            </SelectTrigger>
            <SelectContent>
              {allReports.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">
                    {favorites.includes(r.id) && <span className="text-amber-500 text-[10px]">★</span>}
                    {r.id.startsWith("custom_") && <span className="text-blue-400 text-[10px]">●</span>}
                    {r.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Manage favorites */}
        <div className="relative shrink-0">
          <Button variant="ghost" size="sm" className="h-9 text-[11px] text-slate-400" onClick={() => setShowAllReports(!showAllReports)}>
            <Settings className="h-3 w-3" />
          </Button>
          {showAllReports && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowAllReports(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-72 rounded-xl border border-slate-200 bg-white py-2 shadow-xl">
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Gérer les favoris</p>
                {allReports.map((r) => {
                  const isFav = favorites.includes(r.id);
                  const isPrim = primaryId === r.id;
                  const isCustom = r.id.startsWith("custom_");
                  return (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                      <button onClick={() => toggleFavorite(r.id)} className={cn("text-[14px]", isFav ? "text-amber-500" : "text-slate-300 hover:text-amber-400")}>
                        {isFav ? "★" : "☆"}
                      </button>
                      <span className="text-[12px] text-slate-700 flex-1 truncate">{r.label}</span>
                      <button
                        onClick={() => setPrimary(r.id)}
                        className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium transition-all",
                          isPrim ? "bg-blue-100 text-blue-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        )}
                      >
                        {isPrim ? "Principal" : "Définir"}
                      </button>
                      {isCustom && (
                        <button onClick={() => { deleteReport(r.id); setShowAllReports(false); }} className="text-[10px] px-1.5 py-0.5 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-all">
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Nom du rapport *</label>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none" placeholder="Ex: Rapport hebdomadaire" value={newReportName} onChange={(e) => setNewReportName(e.target.value)} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Description</label>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none" placeholder="Description du rapport" value={newReportDesc} onChange={(e) => setNewReportDesc(e.target.value)} />
              </div>
            </div>
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
      {/* Filter panel */}
      {/* ============================================================ */}
      {showFilters && (
        <Card className="border-blue-200 bg-blue-50/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[13px] font-semibold text-slate-900 flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-blue-600" /> Filtrer les données
              </h4>
              {(filterOrg !== "all" || filterAgent !== "all") && (
                <button onClick={() => { setFilterOrg("all"); setFilterAgent("all"); }} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                  Réinitialiser les filtres
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="w-full sm:w-56">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Organisation</label>
                <Select value={filterOrg} onValueChange={setFilterOrg}>
                  <SelectTrigger><SelectValue placeholder="Toutes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les organisations</SelectItem>
                    {orgList.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-56">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Technicien</label>
                <Select value={filterAgent} onValueChange={setFilterAgent}>
                  <SelectTrigger><SelectValue placeholder="Tous" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les techniciens</SelectItem>
                    {agentList.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(filterOrg !== "all" || filterAgent !== "all") && (
                <div className="flex items-center gap-2 mt-4 sm:mt-5">
                  {filterOrg !== "all" && (
                    <Badge variant="primary" className="text-[11px] flex items-center gap-1">
                      {orgList.find((o) => o.id === filterOrg)?.name}
                      <button onClick={() => setFilterOrg("all")}><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {filterAgent !== "all" && (
                    <Badge variant="primary" className="text-[11px] flex items-center gap-1">
                      {filterAgent}
                      <button onClick={() => setFilterAgent("all")}><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* (Widget config removed — use sidebar editor instead) */}

      {/* (Catalog removed — favorites bar + dropdown replaces it) */}

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
                    return (
                      <Card><CardContent className="p-5 text-center text-slate-400 text-[13px]">Widget « {widgetId} »</CardContent></Card>
                    );
                }
              }}
            />
          )}
        </>
      )}

      {/* Widget sidebar */}
      <WidgetSidebar page="reports" open={showWidgetSidebar} onClose={() => setShowWidgetSidebar(false)} />
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
