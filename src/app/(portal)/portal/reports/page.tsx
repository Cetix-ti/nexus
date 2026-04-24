"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Ticket,
  Clock,
  DollarSign,
  Database,
  Loader2,
  Lock,
  Users,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { usePortalUser } from "@/lib/portal/use-portal-user";
import { useLocaleStore } from "@/stores/locale-store";
import { WidgetChart } from "@/components/widgets/widget-chart";
import { remapBaseCategoryResults } from "@/lib/analytics/base-category-remap";
import { PortalMonthlyReportsSection } from "@/components/reports/monthly/portal-monthly-reports-section";

interface ReportData {
  tickets: { total: number; open: number; resolved: number; closed: number };
  projects: {
    total: number;
    active: number;
    atRisk: number;
    completed: number;
    averageProgress: number;
  } | null;
  time: { totalHours: number; billableHours: number; includedHours: number } | null;
  hourBanks: {
    contractId: string;
    contractName: string;
    totalHours: number;
    consumedHours: number;
    remainingHours: number;
    validFrom: string;
    validTo: string;
  }[] | null;
  billing: { pendingAmount: number; invoicedAmount: number } | null;
}

export default function PortalReportsPage() {
  const { permissions, organizationName } = usePortalUser();
  const t = useLocaleStore((s) => s.t);
  const locale = useLocaleStore((s) => s.locale);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticketsByContact, setTicketsByContact] = useState<{ name: string; count: number }[]>([]);
  const [chartRows, setChartRows] = useState(10);

  const canReports = !!permissions.canSeeReports;
  const canTime = !!permissions.canSeeTimeReports;
  const canBank = !!permissions.canSeeHourBankBalance;
  const canBilling = !!permissions.canSeeBillingReports;
  const anyPermission = canReports || canTime || canBank || canBilling;

  useEffect(() => {
    if (!anyPermission) {
      setLoading(false);
      return;
    }
    fetch("/api/v1/portal/reports")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d.data ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));

    // Tickets grouped by contact
    fetch("/api/v1/portal/tickets")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => {
        const tickets = d.data || [];
        const countMap = new Map<string, number>();
        for (const ticket of tickets) {
          const name = ticket.requesterName || ticket.requesterEmail || t("portal.reports.unknown");
          countMap.set(name, (countMap.get(name) || 0) + 1);
        }
        const sorted = Array.from(countMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        setTicketsByContact(sorted);
      })
      .catch(() => {});
  }, [anyPermission]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!anyPermission) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">{t("portal.reports.heading")}</h1>
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Lock className="h-10 w-10 mx-auto mb-3 text-slate-300" strokeWidth={1.5} />
          <p className="text-[14px] text-slate-500">
            {t("portal.reports.noAccess")}
          </p>
          <p className="text-[12px] text-slate-400 mt-1">
            {t("portal.reports.contactAdmin")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("portal.reports.heading")}</h1>
        <p className="text-[13px] text-slate-500 mt-0.5">
          {t("portal.reports.dataOf", { org: organizationName ?? "" })}
        </p>
      </div>

      {canBilling ? <PortalMonthlyReportsSection /> : null}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800">
          {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Tickets */}
          {canReports && data.tickets && (
            <ReportCard
              title={t("portal.reports.tickets")}
              icon={<Ticket className="h-5 w-5 text-blue-600" />}
              bg="bg-blue-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <Metric label={t("portal.reports.open")} value={data.tickets.open} color="text-amber-600" />
                <Metric label={t("portal.reports.resolved")} value={data.tickets.resolved} color="text-emerald-600" />
                <Metric label={t("portal.reports.closed")} value={data.tickets.closed} color="text-slate-500" />
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-[12px] text-slate-500">
                {t("portal.reports.totalLabel")} : <strong className="text-slate-800">{data.tickets.total}</strong> {t("portal.reports.ticketsUnit")}
              </div>
            </ReportCard>
          )}

          {/* Projects */}
          {canReports && data.projects && (
            <ReportCard
              title={t("portal.reports.projects")}
              icon={<BarChart3 className="h-5 w-5 text-violet-600" />}
              bg="bg-violet-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <Metric label={t("portal.reports.active")} value={data.projects.active} color="text-blue-600" />
                <Metric label={t("portal.reports.atRisk")} value={data.projects.atRisk} color="text-red-600" />
                <Metric label={t("portal.reports.completed")} value={data.projects.completed} color="text-emerald-600" />
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-500">{t("portal.reports.avgProgress")}</span>
                  <span className="font-bold text-slate-800">{data.projects.averageProgress}%</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all"
                    style={{ width: `${data.projects.averageProgress}%` }}
                  />
                </div>
              </div>
            </ReportCard>
          )}

          {/* Time */}
          {canTime && data.time && (
            <ReportCard
              title={t("portal.reports.hoursConsumed")}
              icon={<Clock className="h-5 w-5 text-amber-600" />}
              bg="bg-amber-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <Metric label={t("portal.reports.totalLabel")} value={`${data.time.totalHours.toFixed(1)}h`} color="text-slate-800" />
                <Metric label={t("portal.reports.hoursBillable")} value={`${data.time.billableHours.toFixed(1)}h`} color="text-amber-600" />
                <Metric label={t("portal.reports.hoursIncluded")} value={`${data.time.includedHours.toFixed(1)}h`} color="text-emerald-600" />
              </div>
            </ReportCard>
          )}

          {/* Hour banks */}
          {canBank && data.hourBanks && data.hourBanks.length > 0 && (
            <ReportCard
              title={t("portal.reports.hourBanks")}
              icon={<Database className="h-5 w-5 text-emerald-600" />}
              bg="bg-emerald-50"
            >
              <div className="space-y-3 mt-4">
                {data.hourBanks.map((hb) => {
                  const pct = hb.totalHours > 0
                    ? Math.round((hb.consumedHours / hb.totalHours) * 100)
                    : 0;
                  return (
                    <div key={hb.contractId}>
                      <div className="flex items-center justify-between text-[12px] mb-1">
                        <span className="font-medium text-slate-700">{hb.contractName}</span>
                        <span className="text-slate-500">
                          {t("portal.reports.hoursRemaining", { hours: hb.remainingHours.toFixed(1) })}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500",
                          )}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {hb.consumedHours.toFixed(1)}h / {hb.totalHours}h ({pct}%)
                      </p>
                    </div>
                  );
                })}
              </div>
            </ReportCard>
          )}

          {/* Billing */}
          {canBilling && data.billing && (
            <ReportCard
              title={t("portal.reports.billing")}
              icon={<DollarSign className="h-5 w-5 text-blue-600" />}
              bg="bg-blue-50"
              className="md:col-span-2"
            >
              <div className="grid grid-cols-2 gap-6 mt-4">
                <div>
                  <p className="text-[12px] text-slate-500 mb-1">{t("portal.reports.pendingBilling")}</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
                    {data.billing.pendingAmount.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", {
                      style: "currency",
                      currency: "CAD",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-slate-500 mb-1">{t("portal.reports.alreadyBilled")}</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums">
                    {data.billing.invoicedAmount.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", {
                      style: "currency",
                      currency: "CAD",
                    })}
                  </p>
                </div>
              </div>
            </ReportCard>
          )}
        </div>
      )}

      {/* Tickets by contact chart */}
      {ticketsByContact.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <h3 className="text-[15px] font-semibold text-slate-900">
                {t("portal.reports.ticketsByContact")}
              </h3>
            </div>
            <select
              value={chartRows}
              onChange={(e) => setChartRows(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-600"
            >
              <option value={5}>{t("portal.reports.chart.top5")}</option>
              <option value={10}>{t("portal.reports.chart.top10")}</option>
              <option value={20}>{t("portal.reports.chart.top20")}</option>
              <option value={50}>{t("portal.reports.chart.all")}</option>
            </select>
          </div>
          <div style={{ height: Math.max(200, Math.min(ticketsByContact.slice(0, chartRows).length * 36, 600)) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ticketsByContact.slice(0, chartRows)}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94A3B8" }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: "#475569" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "13px" }}
                  formatter={(value) => [t("portal.reports.chart.tooltip", { count: value as number }), ""]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {ticketsByContact.slice(0, chartRows).map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#2563EB" : i < 3 ? "#3B82F6" : "#93C5FD"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tableaux de bord publiés par l'agent pour cette organisation.
          Rendus via le même WidgetChart que la page /analytics de l'agent.
          Toutes les requêtes sont scoped au portail par le serveur. */}
      {canReports && <PublishedDashboardsSection />}
    </div>
  );
}

function ReportCard({
  title,
  icon,
  bg,
  className,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  bg: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", bg)}>
          {icon}
        </div>
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={cn("text-[18px] font-bold tabular-nums", color)}>
        {value}
      </p>
    </div>
  );
}

// ===========================================================================
// PublishedDashboardsSection — rend les dashboards publiés par l'agent
// pour cette organisation. Chaque widget est fetché via l'endpoint
// /api/v1/portal/dashboard-widget-query qui force organizationId = celle
// du contact (sécurité : le client ne peut pas voir d'autres orgs).
// ===========================================================================
interface PublishedDashboard {
  id: string;
  dashboardKey: string;
  label: string;
  description: string | null;
  config: {
    widgets: Array<{ id: string; name: string; chartType: string; color?: string; query?: any }>;
    layout: Array<{ widgetId: string; x?: number; y?: number; w?: number; h?: number }>;
  };
  updatedAt: string;
}

function PublishedDashboardsSection() {
  const [dashboards, setDashboards] = useState<PublishedDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/portal/published-dashboards")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setDashboards(list);
        if (list.length > 0) setActiveId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des tableaux de bord…
        </div>
      </div>
    );
  }
  if (dashboards.length === 0) return null;

  const active = dashboards.find((d) => d.id === activeId);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            Tableaux de bord personnalisés
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Tableaux publiés par votre équipe IT.
          </p>
        </div>
      </div>

      {dashboards.length > 1 && (
        <div className="px-5 py-2 border-b border-slate-200 flex flex-wrap gap-1.5 bg-slate-50/60">
          {dashboards.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                activeId === d.id
                  ? "bg-white text-blue-700 ring-1 ring-inset ring-blue-200"
                  : "text-slate-600 hover:bg-white",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {active && <PublishedDashboardContent dashboard={active} />}
    </div>
  );
}

function PublishedDashboardContent({ dashboard }: { dashboard: PublishedDashboard }) {
  const widgets = dashboard.config.widgets ?? [];
  const layout = dashboard.config.layout ?? [];
  // Utilise l'ordre du layout si présent, sinon l'ordre des widgets.
  const orderedIds = layout.length > 0
    ? layout.map((l) => l.widgetId).filter((id) => widgets.some((w) => w.id === id))
    : widgets.map((w) => w.id);

  if (orderedIds.length === 0) {
    return (
      <div className="p-5 text-[13px] text-slate-400 text-center">
        Aucun widget dans ce tableau de bord.
      </div>
    );
  }

  return (
    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
      {orderedIds.map((wid) => {
        const widget = widgets.find((w) => w.id === wid);
        if (!widget) return null;
        return (
          <PublishedWidgetCard
            key={wid}
            dashboardId={dashboard.id}
            widget={widget}
          />
        );
      })}
    </div>
  );
}

function PublishedWidgetCard({
  dashboardId, widget,
}: {
  dashboardId: string;
  widget: PublishedDashboard["config"]["widgets"][number];
}) {
  const [results, setResults] = useState<Array<{ label: string; value: number; source?: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/portal/dashboard-widget-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publishedDashboardId: dashboardId, widgetId: widget.id }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        // Remap timeType raw → libellé catégorie de base (même logique
        // que l'UI agent, pour cohérence d'affichage portail ↔ agent).
        const remapped = remapBaseCategoryResults(widget.query?.groupBy, d.results ?? []);
        setResults(remapped);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [dashboardId, widget.id]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-[13px] font-semibold text-slate-900 mb-1">{widget.name}</h3>
      {loading && (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        </div>
      )}
      {error && (
        <p className="py-4 text-[12px] text-red-600 text-center">{error}</p>
      )}
      {results && results.length === 0 && !error && (
        <p className="py-4 text-[12px] text-slate-400 text-center">Aucune donnée</p>
      )}
      {results && results.length > 0 && (
        <WidgetChart
          results={results}
          chartType={widget.chartType as any}
          color={widget.color ?? "#2563eb"}
          name={widget.name}
        />
      )}
    </div>
  );
}
