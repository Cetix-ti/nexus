"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Building2,
  FileText,
  Loader2,
  Receipt,
  MapPin,
  Moon,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FinanceData {
  period: { days: number; since: string };
  kpis: {
    totalRevenue: number;
    prevRevenue: number;
    revenueTrend: number;
    totalHours: number;
    prevHours: number;
    billableHours: number;
    includedHours: number;
    nonBillableHours: number;
    billableRate: number;
    onsiteRevenue: number;
    afterHoursRevenue: number;
    activeContractsCount: number;
    monthlyContractValue: number;
    projectedMonthlyRevenue: number;
  };
  revenueByOrg: { organizationId: string; organizationName: string; revenue: number; hours: number }[];
  coverageBreakdown: { status: string; hours: number; revenue: number }[];
  contracts: { id: string; name: string; organizationName: string; type: string; status: string; monthlyValue: number | null; startDate: string | null; endDate: string | null }[];
}

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

function fmtMoney(v: number): string {
  return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

export default function FinancesPage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/finances?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  const k = data?.kpis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Finances</h1>
          <p className="mt-1 text-[13px] text-slate-500">Vue d&apos;ensemble financière — {days === "7" ? "7 derniers jours" : days === "30" ? "30 derniers jours" : days === "90" ? "3 derniers mois" : "12 derniers mois"}</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 jours</SelectItem>
            <SelectItem value="30">30 jours</SelectItem>
            <SelectItem value="90">3 mois</SelectItem>
            <SelectItem value="365">12 mois</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      {k && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              label="Revenus"
              value={fmtMoney(k.totalRevenue)}
              trend={k.revenueTrend}
              icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
              bg="bg-emerald-50"
            />
            <KpiCard
              label="Heures totales"
              value={`${k.totalHours}h`}
              icon={<Clock className="h-4 w-4 text-blue-600" />}
              bg="bg-blue-50"
            />
            <KpiCard
              label="Taux facturable"
              value={`${k.billableRate}%`}
              icon={<PieChart className="h-4 w-4 text-violet-600" />}
              bg="bg-violet-50"
            />
            <KpiCard
              label="Sur place"
              value={fmtMoney(k.onsiteRevenue)}
              icon={<MapPin className="h-4 w-4 text-amber-600" />}
              bg="bg-amber-50"
            />
            <KpiCard
              label="Hors heures"
              value={fmtMoney(k.afterHoursRevenue)}
              icon={<Moon className="h-4 w-4 text-indigo-600" />}
              bg="bg-indigo-50"
            />
            <KpiCard
              label="Contrats actifs"
              value={k.activeContractsCount}
              icon={<FileText className="h-4 w-4 text-slate-600" />}
              bg="bg-slate-50"
            />
          </div>

          {/* Projection Card */}
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-slate-900">Projection mensuelle</p>
                    <p className="text-[12px] text-slate-500">Basée sur la moyenne quotidienne actuelle</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Projeté</p>
                    <p className="text-xl font-bold text-emerald-700 tabular-nums">{fmtMoney(k.projectedMonthlyRevenue)}</p>
                  </div>
                  {k.monthlyContractValue > 0 && (
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">Contrats récurrents</p>
                      <p className="text-xl font-bold text-blue-700 tabular-nums">{fmtMoney(k.monthlyContractValue)}/mois</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Organization */}
        {data?.revenueByOrg && data.revenueByOrg.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-500" />
                Revenus par client
              </h3>
              <div className="space-y-2.5">
                {data.revenueByOrg.map((o) => {
                  const maxRevenue = data.revenueByOrg[0]?.revenue || 1;
                  const pct = Math.round((o.revenue / maxRevenue) * 100);
                  return (
                    <div key={o.organizationId} className="flex items-center gap-3">
                      <span className="text-[12px] text-slate-700 w-32 truncate font-medium">{o.organizationName}</span>
                      <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-right w-24 shrink-0">
                        <span className="text-[12px] font-bold text-slate-800 tabular-nums">{fmtMoney(o.revenue)}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 w-12 text-right tabular-nums">{o.hours}h</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Coverage Breakdown */}
        {data?.coverageBreakdown && data.coverageBreakdown.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-slate-500" />
                Répartition par couverture
              </h3>
              <div className="space-y-2.5">
                {data.coverageBreakdown
                  .sort((a, b) => b.hours - a.hours)
                  .map((c) => (
                    <div key={c.status} className="flex items-center gap-3">
                      <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", COVERAGE_COLORS[c.status] ?? "bg-slate-400")} />
                      <span className="text-[12px] text-slate-700 flex-1 truncate">
                        {COVERAGE_LABELS[c.status] ?? c.status}
                      </span>
                      <span className="text-[12px] font-medium text-slate-600 tabular-nums w-14 text-right">{c.hours}h</span>
                      <span className="text-[12px] font-bold text-slate-800 tabular-nums w-24 text-right">{fmtMoney(c.revenue)}</span>
                    </div>
                  ))}
              </div>

              {/* Visual bar */}
              {k && k.totalHours > 0 && (
                <div className="mt-4 h-3 rounded-full bg-slate-100 overflow-hidden flex">
                  <div className="bg-emerald-500 transition-all" style={{ width: `${(k.billableHours / k.totalHours) * 100}%` }} title="Facturable" />
                  <div className="bg-blue-500 transition-all" style={{ width: `${(k.includedHours / k.totalHours) * 100}%` }} title="Inclus" />
                  <div className="bg-slate-400 transition-all" style={{ width: `${(k.nonBillableHours / k.totalHours) * 100}%` }} title="Non facturable" />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Active Contracts */}
      {data?.contracts && data.contracts.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              Contrats actifs
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                  <th className="px-4 py-3 font-medium text-slate-500">Contrat</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Type</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Valeur mensuelle</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Échéance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">{c.organizationName}</td>
                    <td className="px-4 py-3"><Badge variant="default" className="text-[10px]">{c.type}</Badge></td>
                    <td className="px-4 py-3 font-medium tabular-nums text-slate-800">{c.monthlyValue ? fmtMoney(c.monthlyValue) : "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-slate-500">{c.endDate ? new Date(c.endDate).toLocaleDateString("fr-CA") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ label, value, trend, icon, bg }: {
  label: string;
  value: string | number;
  trend?: number;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", bg)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 truncate">{label}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
            {trend !== undefined && trend !== 0 && (
              <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold", trend > 0 ? "text-emerald-600" : "text-red-600")}>
                {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
