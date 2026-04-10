"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Ticket,
  Building2,
  Users,
  Loader2,
  AlertTriangle,
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

interface ReportData {
  period: { days: number; since: string };
  kpis: {
    totalTickets: number;
    createdInPeriod: number;
    resolvedInPeriod: number;
    openTickets: number;
    slaBreached: number;
    slaCompliance: number;
  };
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  byOrg: { organizationId: string; organizationName: string; count: number }[];
  techPerformance: { userId: string; name: string; avatar: string | null; resolved: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau", OPEN: "Ouvert", IN_PROGRESS: "En cours",
  ON_SITE: "Sur place", WAITING_CLIENT: "En attente", SCHEDULED: "Planifié",
  RESOLVED: "Résolu", CLOSED: "Fermé",
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "Critique", HIGH: "Élevée", MEDIUM: "Moyenne", LOW: "Faible",
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-500", OPEN: "bg-sky-500", IN_PROGRESS: "bg-amber-500",
  ON_SITE: "bg-cyan-500", WAITING_CLIENT: "bg-violet-500",
  RESOLVED: "bg-emerald-500", CLOSED: "bg-slate-400", SCHEDULED: "bg-indigo-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-500", HIGH: "bg-orange-500", MEDIUM: "bg-amber-500", LOW: "bg-emerald-500",
};

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/reports?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Rapports</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Vue d&apos;ensemble de l&apos;activité — {days === "7" ? "7 derniers jours" : days === "30" ? "30 derniers jours" : days === "90" ? "3 derniers mois" : "12 derniers mois"}
          </p>
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

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Créés" value={kpis.createdInPeriod} icon={<Ticket className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
          <KpiCard label="Résolus" value={kpis.resolvedInPeriod} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
          <KpiCard label="Ouverts" value={kpis.openTickets} icon={<Clock className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
          <KpiCard label="SLA dépassés" value={kpis.slaBreached} icon={<AlertTriangle className="h-4 w-4 text-red-600" />} bg="bg-red-50" />
          <KpiCard label="Conformité SLA" value={`${kpis.slaCompliance}%`} icon={<ShieldCheck className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />
          <KpiCard label="Total tickets" value={kpis.totalTickets} icon={<TrendingUp className="h-4 w-4 text-slate-600" />} bg="bg-slate-50" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Status */}
        {data?.byStatus && (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Ticket className="h-4 w-4 text-slate-500" />
                Par statut
              </h3>
              <div className="space-y-2.5">
                {data.byStatus
                  .sort((a, b) => b.count - a.count)
                  .map((s) => {
                    const total = data.byStatus.reduce((sum, x) => sum + x.count, 0);
                    const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                    return (
                      <div key={s.status} className="flex items-center gap-3">
                        <span className="text-[12px] text-slate-600 w-24 truncate">
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
                        <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", STATUS_COLORS[s.status] ?? "bg-slate-400")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[12px] font-bold text-slate-800 tabular-nums w-10 text-right">
                          {s.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Priority */}
        {data?.byPriority && (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-slate-500" />
                Par priorité
              </h3>
              <div className="space-y-2.5">
                {data.byPriority
                  .sort((a, b) => b.count - a.count)
                  .map((p) => {
                    const total = data.byPriority.reduce((sum, x) => sum + x.count, 0);
                    const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
                    return (
                      <div key={p.priority} className="flex items-center gap-3">
                        <span className="text-[12px] text-slate-600 w-24 truncate">
                          {PRIORITY_LABELS[p.priority] ?? p.priority}
                        </span>
                        <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", PRIORITY_COLORS[p.priority] ?? "bg-slate-400")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[12px] font-bold text-slate-800 tabular-nums w-10 text-right">
                          {p.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Organization */}
        {data?.byOrg && data.byOrg.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-500" />
                Par organisation
              </h3>
              <div className="space-y-2">
                {data.byOrg.map((o) => (
                  <div key={o.organizationId} className="flex items-center justify-between py-1.5">
                    <span className="text-[13px] text-slate-700 truncate flex-1">
                      {o.organizationName}
                    </span>
                    <Badge variant="default" className="text-[11px] tabular-nums">
                      {o.count}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tech Performance */}
        {data?.techPerformance && data.techPerformance.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                Performance par technicien
              </h3>
              <div className="space-y-2.5">
                {data.techPerformance.map((t) => (
                  <div key={t.userId} className="flex items-center gap-3">
                    {t.avatar ? (
                      <img src={t.avatar} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-slate-200" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[9px] font-bold">
                        {t.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                    )}
                    <span className="text-[13px] text-slate-700 flex-1 truncate">{t.name}</span>
                    <span className="text-[13px] font-bold text-slate-900 tabular-nums">
                      {t.resolved}
                    </span>
                    <span className="text-[11px] text-slate-400">résolus</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  bg,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", bg)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 truncate">{label}</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
