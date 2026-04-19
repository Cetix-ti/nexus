"use client";

// ============================================================================
// /intelligence/category-learning — État de l'apprentissage des suggestions
// de catégorie. Avoidances token × catégorie, volume feedback, top
// catégories les plus signalées fausses.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Unlock,
  FolderTree,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Avoidance {
  key: string;
  token: string;
  categoryId: string;
  categoryPath: string;
  badCount: number;
  goodCount: number;
  strength: number;
  sampleCount: number;
  updatedAt: string;
}

interface DailyBucket {
  day: string;
  bad: number;
  good: number;
}

interface TopCategory {
  categoryId: string;
  categoryPath: string;
  badCount: number;
  goodCount: number;
}

interface Payload {
  avoidances: Avoidance[];
  dailyTrend: DailyBucket[];
  totals: { bad: number; good: number; total: number };
  topCategories: TopCategory[];
}

export default function CategoryLearningPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/intelligence/category-learning");
      if (!res.ok) {
        setError(res.status === 403 ? "Accès réservé" : "Erreur");
        return;
      }
      setData((await res.json()) as Payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRelease = async (key: string) => {
    setBusyKey(key);
    try {
      const res = await fetch(
        "/api/v1/intelligence/category-learning/release",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        },
      );
      if (res.ok) void load();
    } finally {
      setBusyKey(null);
    }
  };

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
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <FolderTree className="h-6 w-6 text-violet-500" />
          Apprentissage — suggestions de catégorie
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Le triage IA apprend des thumbs-up / thumbs-down sur ses
          propositions de catégorie. Les paires <em>token × catégorie</em>
          qui causent trop de faux positifs sont pénalisées dans le scoring
          — la confidence baisse automatiquement au prochain triage.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi label="Feedback 30j" value={String(data.totals.total)} />
        <Kpi
          label="Mauvaises catégories"
          value={String(data.totals.bad)}
          icon={<ThumbsDown className="h-4 w-4 text-rose-500" />}
          tone="bad"
        />
        <Kpi
          label="Bonnes catégories"
          value={String(data.totals.good)}
          icon={<ThumbsUp className="h-4 w-4 text-emerald-500" />}
          tone="good"
        />
        <Kpi
          label="Avoidances actives"
          value={String(data.avoidances.length)}
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
          Volume de feedback par jour (30 derniers jours)
        </h2>
        {data.dailyTrend.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Pas encore de feedback.
          </p>
        ) : (
          <DualBarChart data={data.dailyTrend} />
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          <TrendingDown className="h-4 w-4 text-rose-500" />
          Avoidances apprises ({data.avoidances.length})
        </h2>
        {data.avoidances.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Aucune pénalité apprise pour le moment. Le learner tourne toutes
            les 6 h.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.avoidances.map((a) => (
              <li
                key={a.key}
                className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/30"
              >
                <span className="font-mono text-sm font-medium text-slate-800 dark:text-slate-100">
                  {a.token}
                </span>
                <span className="text-xs text-slate-400">↛</span>
                <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                  {a.categoryPath}
                </span>
                <span className="text-xs text-rose-600 dark:text-rose-400">
                  <ThumbsDown className="mr-0.5 inline h-3 w-3" />
                  {a.badCount}
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  <ThumbsUp className="mr-0.5 inline h-3 w-3" />
                  {a.goodCount}
                </span>
                <PenaltyBar value={a.strength} />
                <span className="text-[10px] text-slate-400">
                  maj {new Date(a.updatedAt).toLocaleDateString("fr-CA")}
                </span>
                <button
                  type="button"
                  disabled={busyKey === a.key}
                  onClick={() => handleRelease(a.key)}
                  className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {busyKey === a.key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Unlock className="h-3 w-3" />
                  )}
                  Libérer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
          Catégories les plus signalées mauvaises
        </h2>
        {data.topCategories.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Aucune catégorie particulièrement signalée.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.topCategories.map((c) => (
              <li
                key={c.categoryId}
                className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-800/30"
              >
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                  {c.categoryPath}
                </span>
                <span className="text-xs text-rose-600 dark:text-rose-400">
                  <ThumbsDown className="mr-0.5 inline h-3 w-3" />
                  {c.badCount}
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  <ThumbsUp className="mr-0.5 inline h-3 w-3" />
                  {c.goodCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "good" | "bad";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", cls)}>
        {value}
      </div>
    </div>
  );
}

function PenaltyBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full bg-rose-500"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-10 text-right text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
        −{pct}%
      </span>
    </div>
  );
}

function DualBarChart({ data }: { data: DailyBucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.bad + d.good));
  const w = 720;
  const h = 80;
  const barW = w / data.length;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">
        {data.map((d, i) => {
          const x = i * barW;
          const goodH = (d.good / max) * h;
          const badH = (d.bad / max) * h;
          return (
            <g key={d.day}>
              <rect
                x={x + 2}
                y={h - goodH}
                width={barW - 4}
                height={goodH}
                className="fill-emerald-400"
              />
              <rect
                x={x + 2}
                y={h - goodH - badH}
                width={barW - 4}
                height={badH}
                className="fill-rose-500"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>{data[0]?.day}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-rose-500" />
            bad
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-400" />
            good
          </span>
        </div>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}
