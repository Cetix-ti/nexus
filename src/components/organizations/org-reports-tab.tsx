"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  DollarSign,
  TrendingUp,
  PieChart,
  Users,
  MapPin,
  Moon,
  Ticket,
  Timer,
  Loader2,
  BarChart3,
  FileText,
  AlertTriangle,
  Receipt,
  LayoutDashboard,
  List,
  Eye,
  EyeOff,
  Settings,
  ChevronRight,
  ArrowLeft,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ReportKpis {
  totalHours: number;
  billableHours: number;
  includedHours: number;
  nonBillableHours: number;
  billableRate: number;
  totalRevenue: number;
  billableRevenue: number;
  avgHourlyRate: number;
  onsiteHours: number;
  afterHoursHours: number;
  ticketCount: number;
  avgResolutionHours: number | null;
  medianResolutionHours: number | null;
}

interface MonthlyRow {
  month: string;
  hours: number;
  revenue: number;
  billableHours: number;
  billableRate: number;
}

interface AgentRow {
  agentName: string;
  hours: number;
  revenue: number;
  entries: number;
}

interface CoverageRow {
  status: string;
  hours: number;
  revenue: number;
  count: number;
}

interface TopTicketRow {
  ticketNumber: number;
  subject: string;
  status: string;
  hours: number;
  revenue: number;
}

interface ContractUsageRow {
  id: string;
  name: string;
  type: string;
  monthlyHours: number;
  usedHours: number;
  remainingHours: number;
  usagePercent: number;
  hourlyRate: number;
}

interface ReportData {
  period: { days: number; since: string };
  kpis: ReportKpis;
  monthlyBreakdown: MonthlyRow[];
  agentBreakdown: AgentRow[];
  coverageBreakdown: CoverageRow[];
  ticketStats: {
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
  };
  topTickets: TopTicketRow[];
  contractUsage: ContractUsageRow[];
}

// ---------------------------------------------------------------------------
// Widget definitions
// ---------------------------------------------------------------------------
type WidgetId =
  | "kpis"
  | "resolution"
  | "monthly_trend"
  | "agent_breakdown"
  | "coverage_breakdown"
  | "tickets_by_status"
  | "tickets_by_priority"
  | "tickets_by_type"
  | "contract_usage"
  | "top_tickets";

interface WidgetDef {
  id: WidgetId;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "facturation" | "tickets" | "contrats";
}

const WIDGETS: WidgetDef[] = [
  { id: "kpis", label: "Indicateurs clés", description: "Heures, revenus, taux facturable, sur place, hors horaire", icon: <TrendingUp className="h-4 w-4" />, category: "facturation" },
  { id: "resolution", label: "Temps de résolution", description: "Moyenne et médiane du temps de résolution des tickets", icon: <Timer className="h-4 w-4" />, category: "tickets" },
  { id: "monthly_trend", label: "Tendance mensuelle", description: "Graphique et table des heures et revenus sur 12 mois", icon: <BarChart3 className="h-4 w-4" />, category: "facturation" },
  { id: "agent_breakdown", label: "Répartition par technicien", description: "Heures et revenus par agent assigné", icon: <Users className="h-4 w-4" />, category: "facturation" },
  { id: "coverage_breakdown", label: "Répartition par couverture", description: "Facturable, inclus contrat, banque d'heures, etc.", icon: <Receipt className="h-4 w-4" />, category: "facturation" },
  { id: "tickets_by_status", label: "Tickets par statut", description: "Distribution des tickets ouverts, en cours, fermés", icon: <Ticket className="h-4 w-4" />, category: "tickets" },
  { id: "tickets_by_priority", label: "Tickets par priorité", description: "Distribution critique, haute, moyenne, basse", icon: <AlertTriangle className="h-4 w-4" />, category: "tickets" },
  { id: "tickets_by_type", label: "Tickets par type", description: "Incidents, demandes, problèmes, changements", icon: <FileText className="h-4 w-4" />, category: "tickets" },
  { id: "contract_usage", label: "Utilisation des contrats", description: "Heures utilisées vs allouées par contrat actif", icon: <FileText className="h-4 w-4" />, category: "contrats" },
  { id: "top_tickets", label: "Top tickets par temps", description: "Les 10 tickets avec le plus de temps investi", icon: <Clock className="h-4 w-4" />, category: "tickets" },
];

const DEFAULT_VISIBLE: WidgetId[] = [
  "kpis",
  "monthly_trend",
  "agent_breakdown",
  "coverage_breakdown",
  "contract_usage",
  "top_tickets",
];

// ---------------------------------------------------------------------------
// Report catalog (standalone full-page reports)
// ---------------------------------------------------------------------------
interface ReportDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "facturation" | "tickets" | "contrats" | "performance";
  widgets: WidgetId[];
}

const REPORT_CATALOG: ReportDef[] = [
  {
    id: "billing_overview",
    label: "Sommaire de facturation",
    description: "Vue complète des heures, revenus, taux facturable et répartition par couverture",
    icon: <DollarSign className="h-5 w-5 text-emerald-600" />,
    category: "facturation",
    widgets: ["kpis", "monthly_trend", "coverage_breakdown", "agent_breakdown"],
  },
  {
    id: "profitability",
    label: "Analyse de rentabilité",
    description: "Revenus par technicien, taux horaire moyen et tendance mensuelle",
    icon: <TrendingUp className="h-5 w-5 text-blue-600" />,
    category: "facturation",
    widgets: ["kpis", "agent_breakdown", "monthly_trend"],
  },
  {
    id: "ticket_analysis",
    label: "Analyse des tickets",
    description: "Distribution par statut, priorité, type et temps de résolution",
    icon: <Ticket className="h-5 w-5 text-violet-600" />,
    category: "tickets",
    widgets: ["kpis", "resolution", "tickets_by_status", "tickets_by_priority", "tickets_by_type", "top_tickets"],
  },
  {
    id: "contract_review",
    label: "Revue des contrats",
    description: "Utilisation des heures par contrat, dépassements et couverture",
    icon: <FileText className="h-5 w-5 text-amber-600" />,
    category: "contrats",
    widgets: ["contract_usage", "coverage_breakdown", "kpis"],
  },
  {
    id: "agent_performance",
    label: "Performance des techniciens",
    description: "Heures par technicien, revenus générés et top tickets",
    icon: <Users className="h-5 w-5 text-indigo-600" />,
    category: "performance",
    widgets: ["agent_breakdown", "top_tickets", "kpis"],
  },
  {
    id: "full_report",
    label: "Rapport complet",
    description: "Tous les indicateurs et graphiques en un seul rapport",
    icon: <BarChart3 className="h-5 w-5 text-slate-600" />,
    category: "facturation",
    widgets: ["kpis", "resolution", "monthly_trend", "agent_breakdown", "coverage_breakdown", "tickets_by_status", "tickets_by_priority", "tickets_by_type", "contract_usage", "top_tickets"],
  },
];

const REPORT_CAT_LABELS: Record<string, string> = {
  facturation: "Facturation",
  tickets: "Tickets",
  contrats: "Contrats",
  performance: "Performance",
};

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
const COVERAGE_LABELS: Record<string, string> = {
  billable: "Facturable",
  included_in_contract: "Inclus contrat",
  hour_bank: "Banque d'heures",
  hour_bank_overage: "Dépassement banque",
  msp_overage: "Hors forfait",
  non_billable: "Non facturable",
  pending: "En attente",
  travel_billable: "Déplacement facturable",
};

const COVERAGE_COLORS: Record<string, string> = {
  billable: "bg-emerald-500",
  included_in_contract: "bg-blue-500",
  hour_bank: "bg-violet-500",
  hour_bank_overage: "bg-amber-500",
  msp_overage: "bg-orange-500",
  non_billable: "bg-slate-400",
  pending: "bg-slate-300",
  travel_billable: "bg-cyan-500",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  OPEN: "Ouvert",
  IN_PROGRESS: "En cours",
  PENDING: "En attente",
  RESOLVED: "Résolu",
  CLOSED: "Fermé",
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "Critique",
  HIGH: "Haute",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

const TYPE_LABELS: Record<string, string> = {
  INCIDENT: "Incident",
  REQUEST: "Demande",
  PROBLEM: "Problème",
  CHANGE: "Changement",
};

const MONTH_NAMES = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

function fmtMoney(v: number): string {
  return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function fmtHours(h: number): string {
  return `${h.toLocaleString("fr-CA", { maximumFractionDigits: 1 })}h`;
}

function monthLabel(key: string): string {
  const [, m] = key.split("-");
  return MONTH_NAMES[parseInt(m, 10) - 1] || key;
}

// ---------------------------------------------------------------------------
// localStorage key for widget visibility
// ---------------------------------------------------------------------------
function storageKey(orgId: string) {
  return `nexus:org-reports:${orgId}:widgets`;
}

function loadVisible(orgId: string): WidgetId[] {
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_VISIBLE;
}

function saveVisible(orgId: string, ids: WidgetId[]) {
  try {
    localStorage.setItem(storageKey(orgId), JSON.stringify(ids));
  } catch {}
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function OrgReportsTab({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("90");

  // View mode: "dashboard" or a specific report id
  const [view, setView] = useState<"dashboard" | string>("dashboard");
  const [showConfig, setShowConfig] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(() => loadVisible(organizationId));

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/organizations/${organizationId}/reports?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [organizationId, days]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleWidget(id: WidgetId) {
    setVisibleWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      saveVisible(organizationId, next);
      return next;
    });
  }

  // Determine which widgets to show
  const activeReport = REPORT_CATALOG.find((r) => r.id === view);
  const displayWidgets = activeReport ? activeReport.widgets : visibleWidgets;

  function isVisible(id: WidgetId) {
    return displayWidgets.includes(id);
  }

  const k = data?.kpis;

  return (
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* Top bar: mode switcher + period + config */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {activeReport ? (
            <>
              <button
                onClick={() => setView("dashboard")}
                className="flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-700 font-medium"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour
              </button>
              <span className="text-slate-300">/</span>
              <span className="text-[14px] font-semibold text-slate-900">{activeReport.label}</span>
            </>
          ) : (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
              <button
                onClick={() => setView("dashboard")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all flex items-center gap-1.5",
                  view === "dashboard"
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </button>
              <button
                onClick={() => setView("catalog")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all flex items-center gap-1.5",
                  view === "catalog"
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <List className="h-3.5 w-3.5" />
                Rapports
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="90">3 mois</SelectItem>
              <SelectItem value="180">6 mois</SelectItem>
              <SelectItem value="365">12 mois</SelectItem>
            </SelectContent>
          </Select>
          {view === "dashboard" && (
            <Button
              variant={showConfig ? "primary" : "outline"}
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
            >
              <Settings className="h-3.5 w-3.5" />
              Widgets
            </Button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Widget configuration panel */}
      {/* ============================================================ */}
      {showConfig && view === "dashboard" && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[13px] font-semibold text-slate-900">Configurer les widgets</h4>
              <button
                onClick={() => {
                  setVisibleWidgets(DEFAULT_VISIBLE);
                  saveVisible(organizationId, DEFAULT_VISIBLE);
                }}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                Réinitialiser
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {WIDGETS.map((w) => {
                const on = visibleWidgets.includes(w.id);
                return (
                  <button
                    key={w.id}
                    onClick={() => toggleWidget(w.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ring-1 ring-inset",
                      on
                        ? "bg-white ring-blue-200 shadow-sm"
                        : "bg-transparent ring-slate-200/60 opacity-60 hover:opacity-80"
                    )}
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      on ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"
                    )}>
                      {w.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-slate-800 truncate">{w.label}</p>
                      <p className="text-[10px] text-slate-500 truncate">{w.description}</p>
                    </div>
                    {on ? (
                      <Eye className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Report Catalog View */}
      {/* ============================================================ */}
      {view === "catalog" && (
        <div className="space-y-6">
          {(["facturation", "tickets", "contrats", "performance"] as const).map((cat) => {
            const reports = REPORT_CATALOG.filter((r) => r.category === cat);
            if (reports.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-3">
                  {REPORT_CAT_LABELS[cat]}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {reports.map((r) => (
                    <Card
                      key={r.id}
                      className="cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                      onClick={() => setView(r.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                            {r.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-[13px] font-semibold text-slate-900 truncate">{r.label}</h4>
                              <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">{r.description}</p>
                            <div className="mt-2 flex items-center gap-1">
                              <span className="text-[10px] text-slate-400">{r.widgets.length} widgets</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* Dashboard / Report Content */}
      {/* ============================================================ */}
      {view !== "catalog" && (
        <>
          {/* Loading */}
          {loading && !data && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}

          {/* Empty state when no widgets selected */}
          {!loading && displayWidgets.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <LayoutDashboard className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                <h3 className="text-[15px] font-semibold text-slate-900">Aucun widget sélectionné</h3>
                <p className="mt-1 text-[13px] text-slate-500">
                  Cliquez sur « Widgets » pour choisir les indicateurs à afficher.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Widgets render in order */}
          {data && (
            <div className="space-y-6">
              {/* KPIs */}
              {isVisible("kpis") && k && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <KpiCard label="Heures totales" value={fmtHours(k.totalHours)} icon={<Clock className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
                  <KpiCard label="Heures facturables" value={fmtHours(k.billableHours)} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
                  <KpiCard label="Taux facturable" value={`${k.billableRate}%`} icon={<PieChart className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />
                  <KpiCard label="Revenus" value={fmtMoney(k.totalRevenue)} icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
                  <KpiCard label="Taux horaire moyen" value={fmtMoney(k.avgHourlyRate)} icon={<DollarSign className="h-4 w-4 text-slate-600" />} bg="bg-slate-50" sub="/h" />
                  <KpiCard label="Heures sur place" value={fmtHours(k.onsiteHours)} icon={<MapPin className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
                  <KpiCard label="Heures hors horaire" value={fmtHours(k.afterHoursHours)} icon={<Moon className="h-4 w-4 text-indigo-600" />} bg="bg-indigo-50" />
                  <KpiCard label="Tickets" value={k.ticketCount} icon={<Ticket className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
                </div>
              )}

              {/* Resolution */}
              {isVisible("resolution") && k && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <KpiCard
                    label="Temps résolution moyen"
                    value={k.avgResolutionHours != null ? (k.avgResolutionHours < 24 ? `${k.avgResolutionHours}h` : `${Math.round(k.avgResolutionHours / 24)}j`) : "—"}
                    icon={<Timer className="h-4 w-4 text-orange-600" />}
                    bg="bg-orange-50"
                  />
                  <KpiCard
                    label="Temps résolution médian"
                    value={k.medianResolutionHours != null ? (k.medianResolutionHours < 24 ? `${k.medianResolutionHours}h` : `${Math.round(k.medianResolutionHours / 24)}j`) : "—"}
                    icon={<Timer className="h-4 w-4 text-cyan-600" />}
                    bg="bg-cyan-50"
                  />
                  <KpiCard
                    label="Heures incluses (contrat)"
                    value={fmtHours(k.includedHours)}
                    icon={<FileText className="h-4 w-4 text-blue-600" />}
                    bg="bg-blue-50"
                  />
                </div>
              )}

              {/* Monthly Trend */}
              {isVisible("monthly_trend") && <MonthlyTrendWidget data={data} />}

              {/* Agent + Coverage side by side */}
              {(isVisible("agent_breakdown") || isVisible("coverage_breakdown")) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {isVisible("agent_breakdown") && <AgentBreakdownWidget data={data} />}
                  {isVisible("coverage_breakdown") && <CoverageBreakdownWidget data={data} />}
                </div>
              )}

              {/* Ticket stats */}
              {(isVisible("tickets_by_status") || isVisible("tickets_by_priority") || isVisible("tickets_by_type")) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {isVisible("tickets_by_status") && <TicketsByStatusWidget data={data} />}
                  {isVisible("tickets_by_priority") && <TicketsByPriorityWidget data={data} />}
                  {isVisible("tickets_by_type") && <TicketsByTypeWidget data={data} />}
                </div>
              )}

              {/* Contract Usage */}
              {isVisible("contract_usage") && <ContractUsageWidget data={data} />}

              {/* Top Tickets */}
              {isVisible("top_tickets") && <TopTicketsWidget data={data} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// WIDGET COMPONENTS
// ===========================================================================

function MonthlyTrendWidget({ data }: { data: ReportData }) {
  const maxMonthlyHours = Math.max(...data.monthlyBreakdown.map((m) => m.hours), 1);
  const maxMonthlyRevenue = Math.max(...data.monthlyBreakdown.map((m) => m.revenue), 1);

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-slate-500" />
          Tendance mensuelle (12 mois)
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">Heures</p>
            <div className="flex items-end gap-1 h-28">
              {data.monthlyBreakdown.map((m) => {
                const pct = (m.hours / maxMonthlyHours) * 100;
                const billPct = m.hours > 0 ? (m.billableHours / m.hours) * 100 : 0;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full relative" style={{ height: "100px" }}>
                      <div className="absolute bottom-0 left-0 right-0 rounded-t bg-slate-200 transition-all" style={{ height: `${Math.max(pct, 2)}%` }}>
                        <div className="absolute bottom-0 left-0 right-0 rounded-t bg-blue-500 transition-all" style={{ height: `${billPct}%` }} />
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-400">{monthLabel(m.month)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <div className="h-2 w-2 rounded-full bg-blue-500" /> Facturable
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <div className="h-2 w-2 rounded-full bg-slate-200" /> Total
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">Revenus</p>
            <div className="flex items-end gap-1 h-20">
              {data.monthlyBreakdown.map((m) => {
                const pct = (m.revenue / maxMonthlyRevenue) * 100;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full relative" style={{ height: "72px" }}>
                      <div className="absolute bottom-0 left-0 right-0 rounded-t bg-emerald-500 transition-all" style={{ height: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="text-[9px] text-slate-400">{monthLabel(m.month)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="pb-2 font-medium text-slate-500">Mois</th>
                  <th className="pb-2 font-medium text-slate-500 text-right">Heures</th>
                  <th className="pb-2 font-medium text-slate-500 text-right">Facturable</th>
                  <th className="pb-2 font-medium text-slate-500 text-right">Taux</th>
                  <th className="pb-2 font-medium text-slate-500 text-right">Revenus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.monthlyBreakdown.map((m) => (
                  <tr key={m.month}>
                    <td className="py-2 text-slate-700 font-medium">{m.month}</td>
                    <td className="py-2 text-slate-600 text-right tabular-nums">{fmtHours(m.hours)}</td>
                    <td className="py-2 text-slate-600 text-right tabular-nums">{fmtHours(m.billableHours)}</td>
                    <td className="py-2 text-right tabular-nums">
                      <span className={cn("font-medium", m.billableRate >= 70 ? "text-emerald-600" : m.billableRate >= 40 ? "text-amber-600" : "text-red-600")}>
                        {m.billableRate}%
                      </span>
                    </td>
                    <td className="py-2 text-slate-800 text-right tabular-nums font-medium">{fmtMoney(m.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentBreakdownWidget({ data }: { data: ReportData }) {
  if (data.agentBreakdown.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" /> Répartition par technicien
          </h3>
          <p className="text-[12px] text-slate-400 py-6 text-center">Aucune entrée de temps pour cette période</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" /> Répartition par technicien
        </h3>
        <div className="space-y-3">
          {data.agentBreakdown.map((a) => {
            const maxH = data.agentBreakdown[0]?.hours || 1;
            const pct = Math.round((a.hours / maxH) * 100);
            return (
              <div key={a.agentName}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-slate-700">{a.agentName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500 tabular-nums">{a.entries} entrées</span>
                    <span className="text-[12px] font-bold text-slate-800 tabular-nums">{fmtHours(a.hours)}</span>
                    <span className="text-[11px] text-emerald-700 tabular-nums font-medium w-20 text-right">{fmtMoney(a.revenue)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CoverageBreakdownWidget({ data }: { data: ReportData }) {
  const k = data.kpis;
  if (data.coverageBreakdown.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-slate-500" /> Répartition par couverture
          </h3>
          <p className="text-[12px] text-slate-400 py-6 text-center">Aucune entrée de temps pour cette période</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-slate-500" /> Répartition par couverture
        </h3>
        <div className="space-y-2.5">
          {data.coverageBreakdown.map((c) => (
            <div key={c.status} className="flex items-center gap-3">
              <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", COVERAGE_COLORS[c.status] ?? "bg-slate-400")} />
              <span className="text-[12px] text-slate-700 flex-1 truncate">{COVERAGE_LABELS[c.status] ?? c.status}</span>
              <span className="text-[11px] text-slate-500 tabular-nums w-12 text-right">{c.count}x</span>
              <span className="text-[12px] font-medium text-slate-600 tabular-nums w-14 text-right">{fmtHours(c.hours)}</span>
              <span className="text-[12px] font-bold text-slate-800 tabular-nums w-24 text-right">{fmtMoney(c.revenue)}</span>
            </div>
          ))}
        </div>
        {k.totalHours > 0 && (
          <div className="mt-4 h-3 rounded-full bg-slate-100 overflow-hidden flex">
            {data.coverageBreakdown.map((c) => (
              <div
                key={c.status}
                className={cn("h-full transition-all", COVERAGE_COLORS[c.status] ?? "bg-slate-400")}
                style={{ width: `${(c.hours / k.totalHours) * 100}%` }}
                title={COVERAGE_LABELS[c.status] ?? c.status}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TicketsByStatusWidget({ data }: { data: ReportData }) {
  const entries = Object.entries(data.ticketStats.byStatus);
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[14px] font-semibold text-slate-900 mb-3">Tickets par statut</h3>
        {entries.length > 0 ? (
          <div className="space-y-2">
            {entries.map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <Badge variant="default" className="text-[10px]">{STATUS_LABELS[status] ?? status}</Badge>
                <span className="text-[13px] font-bold text-slate-800 tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-slate-400 py-4 text-center">Aucun ticket</p>
        )}
      </CardContent>
    </Card>
  );
}

function TicketsByPriorityWidget({ data }: { data: ReportData }) {
  const entries = Object.entries(data.ticketStats.byPriority);
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700",
    HIGH: "bg-orange-100 text-orange-700",
    MEDIUM: "bg-amber-100 text-amber-700",
    LOW: "bg-slate-100 text-slate-600",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[14px] font-semibold text-slate-900 mb-3">Tickets par priorité</h3>
        {entries.length > 0 ? (
          <div className="space-y-2">
            {entries.map(([priority, count]) => (
              <div key={priority} className="flex items-center justify-between">
                <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold", colors[priority] ?? "bg-slate-100 text-slate-600")}>
                  {PRIORITY_LABELS[priority] ?? priority}
                </span>
                <span className="text-[13px] font-bold text-slate-800 tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-slate-400 py-4 text-center">Aucun ticket</p>
        )}
      </CardContent>
    </Card>
  );
}

function TicketsByTypeWidget({ data }: { data: ReportData }) {
  const entries = Object.entries(data.ticketStats.byType);
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[14px] font-semibold text-slate-900 mb-3">Tickets par type</h3>
        {entries.length > 0 ? (
          <div className="space-y-2">
            {entries.map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <Badge variant="default" className="text-[10px]">{TYPE_LABELS[type] ?? type}</Badge>
                <span className="text-[13px] font-bold text-slate-800 tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-slate-400 py-4 text-center">Aucun ticket</p>
        )}
      </CardContent>
    </Card>
  );
}

function ContractUsageWidget({ data }: { data: ReportData }) {
  if (data.contractUsage.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" /> Utilisation des contrats
          </h3>
          <p className="text-[12px] text-slate-400 py-6 text-center">Aucun contrat actif</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" /> Utilisation des contrats (mois en cours)
        </h3>
        <div className="space-y-4">
          {data.contractUsage.map((c) => (
            <div key={c.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-slate-900">{c.name}</span>
                  <Badge variant="default" className="text-[9px]">{c.type}</Badge>
                </div>
                <div className="flex items-center gap-3 text-[12px]">
                  <span className="text-slate-500">{fmtHours(c.usedHours)} / {fmtHours(c.monthlyHours)}</span>
                  <span className={cn("font-bold tabular-nums", c.usagePercent >= 90 ? "text-red-600" : c.usagePercent >= 70 ? "text-amber-600" : "text-emerald-600")}>
                    {c.usagePercent}%
                  </span>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", c.usagePercent >= 90 ? "bg-red-500" : c.usagePercent >= 70 ? "bg-amber-500" : "bg-emerald-500")}
                  style={{ width: `${Math.min(c.usagePercent, 100)}%` }}
                />
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
  if (data.topTickets.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Ticket className="h-4 w-4 text-slate-500" /> Top tickets par temps investi
          </h3>
          <p className="text-[12px] text-slate-400 py-6 text-center">Aucune entrée de temps pour cette période</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
          <Ticket className="h-4 w-4 text-slate-500" /> Top tickets par temps investi
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
              <th className="px-4 py-3 font-medium text-slate-500">N°</th>
              <th className="px-4 py-3 font-medium text-slate-500">Sujet</th>
              <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
              <th className="px-4 py-3 font-medium text-slate-500 text-right">Heures</th>
              <th className="px-4 py-3 font-medium text-slate-500 text-right">Revenus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.topTickets.map((t) => (
              <tr key={t.ticketNumber} className="hover:bg-slate-50/80">
                <td className="px-4 py-3 font-medium text-blue-600 tabular-nums">#{t.ticketNumber}</td>
                <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{t.subject}</td>
                <td className="px-4 py-3">
                  <Badge variant="default" className="text-[10px]">{STATUS_LABELS[t.status] ?? t.status}</Badge>
                </td>
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

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
function KpiCard({ label, value, icon, bg, sub }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  bg: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", bg)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 truncate">{label}</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">
            {value}{sub && <span className="text-[12px] font-normal text-slate-400">{sub}</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
