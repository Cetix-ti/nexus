"use client";

import { useState, useMemo } from "react";
import {
  BarChart3,
  Clock,
  Wallet,
  Ticket,
  Receipt,
  Inbox,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mockProjects } from "@/lib/projects/mock-data";
import {
  CURRENT_PORTAL_USER,
  getCurrentPortalOrg,
  hasPortalPermission,
} from "@/lib/portal/current-user";

const PERIODS = [
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "quarter", label: "Trimestre" },
  { key: "year", label: "Année" },
];

function ChartPlaceholder({ color = "blue" }: { color?: "blue" | "emerald" | "violet" | "amber" }) {
  const colorMap = {
    blue: "from-blue-100 to-blue-50",
    emerald: "from-emerald-100 to-emerald-50",
    violet: "from-violet-100 to-violet-50",
    amber: "from-amber-100 to-amber-50",
  };
  return (
    <div
      className={cn(
        "mt-4 h-24 w-full rounded-xl bg-gradient-to-b flex items-end justify-around p-3 gap-1.5",
        colorMap[color]
      )}
    >
      {[40, 65, 30, 80, 55, 90, 70].map((h, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-md",
            color === "blue" && "bg-blue-400/60",
            color === "emerald" && "bg-emerald-400/60",
            color === "violet" && "bg-violet-400/60",
            color === "amber" && "bg-amber-400/60"
          )}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export default function PortalReportsPage() {
  const [period, setPeriod] = useState("30d");
  const orgId = getCurrentPortalOrg();

  const orgProjects = useMemo(
    () =>
      mockProjects.filter(
        (p) =>
          p.organizationId === orgId &&
          p.isVisibleToClient &&
          p.visibilitySettings.showProject
      ),
    [orgId]
  );

  const totalConsumed = orgProjects.reduce((s, p) => s + p.consumedHours, 0);
  const activeProjects = orgProjects.filter((p) => p.status === "active").length;

  // Mock hour bank
  const hourBankPurchased = 200;
  const hourBankConsumed = 137;
  const hourBankPct = Math.round((hourBankConsumed / hourBankPurchased) * 100);

  const canReports = hasPortalPermission("canSeeReports");
  const canTime = hasPortalPermission("canSeeTimeReports");
  const canBank = hasPortalPermission("canSeeHourBankBalance");
  const canBilling = hasPortalPermission("canSeeBillingReports");

  const anyReport = canReports || canTime || canBank || canBilling;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Mes rapports</h1>
        <p className="mt-2 text-base text-neutral-500">
          Vue d&apos;ensemble de l&apos;activité pour{" "}
          <span className="font-medium text-neutral-700">
            {CURRENT_PORTAL_USER.organizationName}
          </span>
        </p>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              period === p.key
                ? "bg-[#2563EB] text-white shadow-sm"
                : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!anyReport ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB]">
            <Inbox className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-neutral-900">
            Aucun rapport disponible
          </h3>
          <p className="mt-1.5 text-sm text-neutral-500">
            Vous n&apos;avez pas accès aux rapports. Contactez votre
            administrateur.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {canReports && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-neutral-900">
                    Avancement des projets
                  </h3>
                  <p className="text-sm text-neutral-500">
                    Suivi de la progression de vos projets actifs
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-neutral-900">
                  {activeProjects}
                </span>
                <span className="text-sm text-neutral-500">
                  projets en cours
                </span>
              </div>
              <ChartPlaceholder color="blue" />
            </div>
          )}

          {canTime && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-neutral-900">
                    Heures consommées
                  </h3>
                  <p className="text-sm text-neutral-500">
                    Temps facturable utilisé sur la période
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-neutral-900">
                  {totalConsumed.toFixed(1)}
                </span>
                <span className="text-sm text-neutral-500">heures</span>
              </div>
              <ChartPlaceholder color="emerald" />
            </div>
          )}

          {canBank && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Wallet className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-neutral-900">
                    Banque d&apos;heures
                  </h3>
                  <p className="text-sm text-neutral-500">
                    Solde disponible
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-bold text-neutral-900">
                      {hourBankPurchased - hourBankConsumed}
                    </span>
                    <span className="ml-1 text-sm text-neutral-500">
                      h restantes
                    </span>
                  </div>
                  <span className="text-sm font-medium text-neutral-600">
                    {hourBankConsumed} / {hourBankPurchased} h
                  </span>
                </div>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      hourBankPct > 80 ? "bg-red-500" : "bg-violet-500"
                    )}
                    style={{ width: `${hourBankPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {hourBankPct}% de la banque consommée
                </p>
              </div>
            </div>
          )}

          {canReports && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Ticket className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-neutral-900">
                    Tickets ouverts / fermés
                  </h3>
                  <p className="text-sm text-neutral-500">
                    Comparaison ouverture / résolution
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-6">
                <div>
                  <p className="text-3xl font-bold text-neutral-900">24</p>
                  <p className="text-xs text-neutral-500">ouverts</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-emerald-600">19</p>
                  <p className="text-xs text-neutral-500">fermés</p>
                </div>
                <div className="ml-auto flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <TrendingUp className="h-3.5 w-3.5" /> +12%
                </div>
              </div>
              <ChartPlaceholder color="amber" />
            </div>
          )}

          {canBilling && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <Receipt className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-neutral-900">
                    Préfacturation à venir
                  </h3>
                  <p className="text-sm text-neutral-500">
                    Estimation des montants à facturer ce mois
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-baseline gap-6">
                <div>
                  <p className="text-3xl font-bold text-neutral-900">
                    18 562 $
                  </p>
                  <p className="text-xs text-neutral-500">total estimé</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-neutral-700">
                    148.5 h
                  </p>
                  <p className="text-xs text-neutral-500">à facturer</p>
                </div>
              </div>
              <ChartPlaceholder color="blue" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
