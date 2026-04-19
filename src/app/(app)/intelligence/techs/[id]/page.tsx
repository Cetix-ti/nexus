"use client";

// ============================================================================
// /intelligence/techs/[id] — Vue coaching d'un tech. Montre son expertise
// par catégorie, sa charge actuelle, ses stats récentes, ses tickets à
// risque SLA et les zones où il pourrait étendre ses compétences.
// ============================================================================

import { use as usePromise, useEffect, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  Loader2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Target,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpertiseRow {
  categoryId: string;
  categoryPath: string;
  expertise: number;
  resolvedCount: number;
  medianMinutes: number;
}

interface GrowthRow {
  categoryId: string;
  categoryPath: string;
  globalVolume: number;
  userResolved30d: number;
}

interface SlaRiskRow {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  riskScore: number;
  reason: string | null;
}

interface Payload {
  user: { id: string; name: string; email: string; role: string };
  totalResolvedHistoric: number;
  openLoad: number;
  resolved30dCount: number;
  avgResolutionMin30d: number | null;
  expertiseList: ExpertiseRow[];
  growthZones: GrowthRow[];
  slaRisks: SlaRiskRow[];
  profileUpdatedAt: string | null;
}

export default function TechCoachingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = usePromise(params);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/intelligence/techs/${id}`);
        if (!res.ok) {
          setError(res.status === 403 ? "Accès réservé" : "Erreur");
          return;
        }
        if (!cancelled) setData((await res.json()) as Payload);
      } catch {
        setError("Connexion impossible");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/intelligence" className="hover:text-indigo-600">
            Intelligence
          </Link>
          <span>›</span>
          <span>Techs</span>
        </div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <User className="h-6 w-6 text-indigo-500" />
          {data.user.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {data.user.email} · {data.user.role}
        </p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Charge actuelle" value={String(data.openLoad)} tone={data.openLoad >= 10 ? "bad" : data.openLoad >= 5 ? "warn" : "good"} />
        <Kpi label="Résolus (30j)" value={String(data.resolved30dCount)} />
        <Kpi
          label="Temps moyen 30j"
          value={data.avgResolutionMin30d !== null ? formatMinutes(data.avgResolutionMin30d) : "—"}
        />
        <Kpi
          label="Résolutions historiques"
          value={String(data.totalResolvedHistoric)}
        />
      </div>

      {/* SLA risks assignés */}
      {data.slaRisks.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            Tickets à risque SLA assignés ({data.slaRisks.length})
          </h2>
          <ul className="space-y-1.5">
            {data.slaRisks.map((r) => (
              <li key={r.ticketId} className="flex items-center gap-2">
                <RiskPct value={r.riskScore} />
                <Link
                  href={`/tickets/${r.ticketId}`}
                  className="min-w-0 flex-1"
                >
                  <div className="truncate text-sm font-medium text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">
                    TK-{r.ticketNumber} — {r.subject}
                  </div>
                  {r.reason && (
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {r.reason}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Expertise matrix */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Expertise par catégorie ({data.expertiseList.length})
          </h2>
          {data.profileUpdatedAt && (
            <span className="ml-auto text-[10px] text-slate-400">
              maj{" "}
              {new Date(data.profileUpdatedAt).toLocaleDateString("fr-CA")}
            </span>
          )}
        </div>
        {data.expertiseList.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Pas assez d&apos;historique pour cartographier son expertise. 3+
            tickets résolus par catégorie nécessaires.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.expertiseList.slice(0, 15).map((e) => (
              <li key={e.categoryId} className="flex items-center gap-3">
                <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {e.categoryPath}
                </span>
                <ExpertiseBar value={e.expertise} />
                <span className="w-16 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {e.resolvedCount} ×
                </span>
                <span className="w-14 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {formatMinutes(e.medianMinutes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Growth zones */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-indigo-500" />
          <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Zones de croissance
          </h2>
          <span
            className="ml-auto text-xs text-slate-400"
            title="Catégories top MSP où ce tech a < 3 tickets résolus sur 30 jours — piste de montée en compétence."
          >
            ?
          </span>
        </div>
        {data.growthZones.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Le tech couvre déjà toutes les catégories à fort volume.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.growthZones.map((g) => (
              <li
                key={g.categoryId}
                className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <TrendingUp className="h-3 w-3 shrink-0 text-indigo-500" />
                <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {g.categoryPath}
                </span>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {g.globalVolume} tickets MSP · lui {g.userResolved30d}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-rose-600 dark:text-rose-400"
          : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", cls)}>
        {value}
      </div>
    </div>
  );
}

function ExpertiseBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const color =
    pct >= 0.8
      ? "bg-emerald-500"
      : pct >= 0.5
        ? "bg-amber-500"
        : "bg-slate-400";
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={cn("h-full", color)} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

function RiskPct({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 85
      ? "bg-rose-600 text-white"
      : pct >= 60
        ? "bg-amber-500 text-white"
        : "bg-slate-400 text-white";
  return (
    <span
      className={cn(
        "flex h-6 w-10 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums",
        color,
      )}
    >
      {pct}%
    </span>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem > 0 ? `${h}h${rem > 9 ? rem : `0${rem}`}` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}j${h % 24 > 0 ? ` ${h % 24}h` : ""}`;
}
