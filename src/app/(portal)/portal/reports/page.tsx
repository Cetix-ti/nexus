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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalUser } from "@/lib/portal/use-portal-user";

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
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <h1 className="text-xl font-bold text-slate-900">Rapports</h1>
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Lock className="h-10 w-10 mx-auto mb-3 text-slate-300" strokeWidth={1.5} />
          <p className="text-[14px] text-slate-500">
            Aucun rapport n&apos;est disponible pour votre compte.
          </p>
          <p className="text-[12px] text-slate-400 mt-1">
            Contactez votre administrateur pour obtenir l&apos;accès.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Rapports</h1>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Données de {organizationName}
        </p>
      </div>

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
              title="Billets"
              icon={<Ticket className="h-5 w-5 text-blue-600" />}
              bg="bg-blue-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <Metric label="Ouverts" value={data.tickets.open} color="text-amber-600" />
                <Metric label="Résolus" value={data.tickets.resolved} color="text-emerald-600" />
                <Metric label="Fermés" value={data.tickets.closed} color="text-slate-500" />
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-[12px] text-slate-500">
                Total : <strong className="text-slate-800">{data.tickets.total}</strong> billets
              </div>
            </ReportCard>
          )}

          {/* Projects */}
          {canReports && data.projects && (
            <ReportCard
              title="Projets"
              icon={<BarChart3 className="h-5 w-5 text-violet-600" />}
              bg="bg-violet-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <Metric label="Actifs" value={data.projects.active} color="text-blue-600" />
                <Metric label="À risque" value={data.projects.atRisk} color="text-red-600" />
                <Metric label="Terminés" value={data.projects.completed} color="text-emerald-600" />
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-500">Avancement moyen</span>
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
              title="Heures consommées"
              icon={<Clock className="h-5 w-5 text-amber-600" />}
              bg="bg-amber-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <Metric label="Total" value={`${data.time.totalHours.toFixed(1)}h`} color="text-slate-800" />
                <Metric label="Facturables" value={`${data.time.billableHours.toFixed(1)}h`} color="text-amber-600" />
                <Metric label="Incluses" value={`${data.time.includedHours.toFixed(1)}h`} color="text-emerald-600" />
              </div>
            </ReportCard>
          )}

          {/* Hour banks */}
          {canBank && data.hourBanks && data.hourBanks.length > 0 && (
            <ReportCard
              title="Banques d'heures"
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
                          {hb.remainingHours.toFixed(1)}h restantes
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
              title="Facturation"
              icon={<DollarSign className="h-5 w-5 text-blue-600" />}
              bg="bg-blue-50"
              className="md:col-span-2"
            >
              <div className="grid grid-cols-2 gap-6 mt-4">
                <div>
                  <p className="text-[12px] text-slate-500 mb-1">En attente de facturation</p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {data.billing.pendingAmount.toLocaleString("fr-CA", {
                      style: "currency",
                      currency: "CAD",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-slate-500 mb-1">Déjà facturé</p>
                  <p className="text-2xl font-bold text-emerald-700 tabular-nums">
                    {data.billing.invoicedAmount.toLocaleString("fr-CA", {
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
