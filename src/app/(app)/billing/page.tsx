"use client";

import { useEffect, useMemo, useState } from "react";
import { PageLoader } from "@/components/ui/page-loader";
import {
  Receipt,
  AlertTriangle,
  Clock,
  Car,
  DollarSign,
  FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  mockTravelEntries,
  mockExpenseEntries,
  mockContracts,
} from "@/lib/billing/mock-data";
import {
  COVERAGE_LABELS,
  COVERAGE_VARIANTS,
  type TimeEntry,
  type CoverageStatus,
} from "@/lib/billing/types";

function fmtCAD(n: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function hours(min: number) {
  return (min / 60).toFixed(1);
}

function getRate(entry: TimeEntry): number {
  // mock data uses `rate`, type declares `hourlyRate`
  return (
    (entry as unknown as { hourlyRate?: number }).hourlyRate ??
    (entry as unknown as { rate?: number }).rate ??
    0
  );
}

function getAmount(entry: TimeEntry): number {
  if (entry.amount != null) return entry.amount;
  const rate = getRate(entry);
  return rate * (entry.durationMinutes / 60);
}

const TABS = [
  { key: "time", label: "Temps", icon: Clock },
  { key: "travel", label: "Déplacements", icon: Car },
  { key: "expenses", label: "Dépenses", icon: Receipt },
  { key: "anomalies", label: "Anomalies", icon: AlertTriangle },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const BILLABLE_STATUSES: CoverageStatus[] = [
  "billable",
  "hour_bank_overage",
  "msp_overage",
  "travel_billable",
];

export default function BillingPage() {
  const [period, setPeriod] = useState("this_month");
  const [orgFilter, setOrgFilter] = useState("all");
  const [tab, setTab] = useState<TabKey>("time");
  const [apiTimeEntries, setApiTimeEntries] = useState<TimeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Fetch des saisies de temps RÉELLES depuis l'API.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/time-entries")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setApiTimeEntries(
          data.map((r: Record<string, unknown>) => ({
            id: String(r.id),
            ticketId: String(r.ticketId),
            ticketNumber: String(r.ticketNumber ?? ""),
            organizationId: String(r.organizationId),
            organizationName: String(r.organizationName ?? "—"),
            agentId: String(r.agentId),
            agentName: String(r.agentName ?? "—"),
            timeType: r.timeType as TimeEntry["timeType"],
            startedAt: String(r.startedAt),
            endedAt: (r.endedAt as string | null) ?? undefined,
            durationMinutes: Number(r.durationMinutes ?? 0),
            description: String(r.description ?? ""),
            isAfterHours: Boolean(r.isAfterHours),
            isWeekend: Boolean(r.isWeekend),
            isUrgent: Boolean(r.isUrgent),
            isOnsite: Boolean(r.isOnsite),
            coverageStatus: r.coverageStatus as TimeEntry["coverageStatus"],
            coverageReason: String(r.coverageReason ?? ""),
            hourlyRate: (r.hourlyRate as number | null) ?? undefined,
            amount: (r.amount as number | null) ?? undefined,
            approvalStatus: (r.approvalStatus as TimeEntry["approvalStatus"]) ?? "draft",
            createdAt: String(r.createdAt),
            updatedAt: String(r.updatedAt),
          }))
        );
      })
      .catch((e) => console.error("time-entries load failed", e))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const orgs = useMemo(() => {
    const map = new Map<string, string>();
    apiTimeEntries.forEach((e) =>
      map.set(e.organizationId, e.organizationName)
    );
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [apiTimeEntries]);

  const filteredTime = useMemo(
    () =>
      apiTimeEntries.filter(
        (e) => orgFilter === "all" || e.organizationId === orgFilter
      ),
    [orgFilter, apiTimeEntries]
  );
  const filteredTravel = useMemo(
    () =>
      mockTravelEntries.filter(
        (e) => orgFilter === "all" || e.organizationId === orgFilter
      ),
    [orgFilter]
  );
  const filteredExpense = useMemo(
    () =>
      mockExpenseEntries.filter(
        (e) => orgFilter === "all" || e.organizationId === orgFilter
      ),
    [orgFilter]
  );

  const kpis = useMemo(() => {
    const totalMin = filteredTime.reduce((s, e) => s + e.durationMinutes, 0);
    const billable = filteredTime.filter((e) =>
      BILLABLE_STATUSES.includes(e.coverageStatus)
    );
    const totalAmount =
      billable.reduce((s, e) => s + getAmount(e), 0) +
      filteredTravel.reduce((s, e) => s + (e.amount ?? 0), 0) +
      filteredExpense
        .filter((e) => e.isRebillable)
        .reduce((s, e) => s + e.amount, 0);
    const included = filteredTime.filter(
      (e) =>
        e.coverageStatus === "included_in_contract" ||
        e.coverageStatus === "deducted_from_hour_bank"
    ).length;
    const bankOverage = filteredTime.filter(
      (e) => e.coverageStatus === "hour_bank_overage"
    ).length;
    const mspOverage = filteredTime.filter(
      (e) => e.coverageStatus === "msp_overage"
    ).length;
    return {
      totalHours: hours(totalMin),
      totalAmount,
      included,
      bankOverage,
      mspOverage,
    };
  }, [filteredTime, filteredTravel, filteredExpense]);

  // Aggregate time entries by organization
  const timeByOrg = useMemo(() => {
    const map = new Map<
      string,
      {
        organizationId: string;
        organizationName: string;
        contractType: string;
        totalMinutes: number;
        billableAmount: number;
        breakdown: Map<CoverageStatus, number>;
      }
    >();
    filteredTime.forEach((e) => {
      const existing = map.get(e.organizationId) ?? {
        organizationId: e.organizationId,
        organizationName: e.organizationName,
        contractType:
          mockContracts.find((c) => c.id === e.contractId)?.type ?? "—",
        totalMinutes: 0,
        billableAmount: 0,
        breakdown: new Map<CoverageStatus, number>(),
      };
      existing.totalMinutes += e.durationMinutes;
      if (BILLABLE_STATUSES.includes(e.coverageStatus)) {
        existing.billableAmount += getAmount(e);
      }
      existing.breakdown.set(
        e.coverageStatus,
        (existing.breakdown.get(e.coverageStatus) ?? 0) + e.durationMinutes
      );
      map.set(e.organizationId, existing);
    });
    return Array.from(map.values());
  }, [filteredTime]);

  // Anomalies
  const anomalies = useMemo(() => {
    const list: { severity: "warning" | "danger"; title: string; detail: string }[] = [];
    mockContracts.forEach((c) => {
      if (c.hourBank) {
        const pct = (c.hourBank.hoursConsumed / c.hourBank.totalHoursPurchased) * 100;
        if (pct >= 95) {
          list.push({
            severity: "danger",
            title: `Banque d'heures épuisée — ${c.organizationName}`,
            detail: `${c.hourBank.hoursConsumed} h / ${c.hourBank.totalHoursPurchased} h consommées (${pct.toFixed(0)}%)`,
          });
        } else if (pct >= 80) {
          list.push({
            severity: "warning",
            title: `Banque d'heures bientôt épuisée — ${c.organizationName}`,
            detail: `${c.hourBank.hoursConsumed} h / ${c.hourBank.totalHoursPurchased} h consommées (${pct.toFixed(0)}%)`,
          });
        }
      }
    });
    apiTimeEntries.forEach((e) => {
      if (e.approvalStatus === "draft") {
        list.push({
          severity: "warning",
          title: `Entrée de temps non soumise — ${e.ticketNumber}`,
          detail: `${e.agentName} · ${(e.durationMinutes / 60).toFixed(1)} h · ${e.organizationName}`,
        });
      }
    });
    return list;
  }, [apiTimeEntries]);

  if (!loaded) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Préfacturation
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Chargement…
          </p>
        </div>
        <PageLoader variant="cards" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Préfacturation
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Révisez le temps non facturé avant émission
          </p>
        </div>
      </div>

      {/* Bannière honnête sur les modules en migration */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12px] text-amber-800">
        <strong>Onglets « Déplacements », « Dépenses » et widgets contrats</strong> :
        ces sous-modules sont encore en migration vers la base de données réelle
        et affichent temporairement des données de démonstration. Seul l&apos;onglet
        <strong> « Saisies de temps »</strong> est branché à la persistance réelle
        (table <code>time_entries</code>).
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">Ce mois</SelectItem>
            <SelectItem value="last_month">Mois dernier</SelectItem>
            <SelectItem value="quarter">Trimestre</SelectItem>
            <SelectItem value="custom">Personnalisé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les organisations</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPI
          icon={Clock}
          label="Temps non facturé"
          value={`${kpis.totalHours} h`}
        />
        <KPI
          icon={DollarSign}
          label="Montant à facturer"
          value={fmtCAD(kpis.totalAmount)}
          accent="primary"
        />
        <KPI
          icon={Receipt}
          label="Inclus au contrat"
          value={`${kpis.included}`}
          accent="success"
        />
        <KPI
          icon={AlertTriangle}
          label="Dépassements banque"
          value={`${kpis.bankOverage}`}
          accent="warning"
        />
        <KPI
          icon={FileWarning}
          label="Hors forfait MSP"
          value={`${kpis.mspOverage}`}
          accent="warning"
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-colors",
                  tab === t.key
                    ? "text-blue-600"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "time" && (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Organisation
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Type contrat
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Total heures
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Montant facturable
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Couverture
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {timeByOrg.map((o) => (
                  <tr key={o.organizationId} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-[13px] font-medium text-slate-900">
                      {o.organizationName}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-slate-600">
                      {o.contractType}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-medium tabular-nums text-slate-900">
                      {hours(o.totalMinutes)} h
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-slate-900">
                      {fmtCAD(o.billableAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(o.breakdown.entries()).map(([status, min]) => (
                          <Badge
                            key={status}
                            variant={COVERAGE_VARIANTS[status]}
                          >
                            {COVERAGE_LABELS[status]} · {hours(min)} h
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {timeByOrg.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-[13px] text-slate-400">
                      Aucune entrée de temps pour cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "travel" && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <ul className="divide-y divide-slate-100">
            {filteredTravel.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between py-3 text-[13px]"
              >
                <div>
                  <div className="font-medium text-slate-900">
                    {t.organizationName} · {t.ticketNumber}
                  </div>
                  <div className="text-[12.5px] text-slate-500">
                    {t.fromLocation} → {t.toLocation} · {t.distanceKm} km
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={COVERAGE_VARIANTS[t.coverageStatus]}>
                    {COVERAGE_LABELS[t.coverageStatus]}
                  </Badge>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {fmtCAD(t.amount ?? 0)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "expenses" && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <ul className="divide-y divide-slate-100">
            {filteredExpense.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between py-3 text-[13px]"
              >
                <div>
                  <div className="font-medium text-slate-900">
                    {e.organizationName} · {e.ticketNumber}
                  </div>
                  <div className="text-[12.5px] text-slate-500">
                    {e.description}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={COVERAGE_VARIANTS[e.coverageStatus]}>
                    {COVERAGE_LABELS[e.coverageStatus]}
                  </Badge>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {fmtCAD(e.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "anomalies" && (
        <div className="space-y-3">
          {anomalies.map((a, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 shadow-sm",
                a.severity === "danger"
                  ? "border-red-200/80 bg-red-50/40"
                  : "border-amber-200/80 bg-amber-50/40"
              )}
            >
              <AlertTriangle
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  a.severity === "danger" ? "text-red-600" : "text-amber-600"
                )}
              />
              <div>
                <div className="text-[13px] font-semibold text-slate-900">
                  {a.title}
                </div>
                <div className="text-[12.5px] text-slate-600">{a.detail}</div>
              </div>
            </div>
          ))}
          {anomalies.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 py-16 text-center text-[13px] text-slate-500">
              Aucune anomalie détectée
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end border-t border-slate-200 pt-6">
        <Button variant="primary" size="lg">
          <Receipt className="h-5 w-5" />
          Émettre les factures
        </Button>
      </div>
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: "primary" | "success" | "warning";
}) {
  const accentClass =
    accent === "primary"
      ? "text-blue-600 bg-blue-50 ring-blue-200/60"
      : accent === "success"
      ? "text-emerald-600 bg-emerald-50 ring-emerald-200/60"
      : accent === "warning"
      ? "text-amber-600 bg-amber-50 ring-amber-200/60"
      : "text-slate-600 bg-slate-100 ring-slate-200/60";
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset",
            accentClass
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="text-[18px] font-semibold tabular-nums text-slate-900">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}
