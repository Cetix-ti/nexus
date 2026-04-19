"use client";

// ============================================================================
// /intelligence/feedback — Vue unifiée des feedbacks explicites collectés.
// Agrège les 6 boucles : similar tickets, catégorie, KB, priorité, doublon,
// type. Montre quelles features sont les plus critiquées et quels techs
// contribuent le plus à l'amélioration du système.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  MessagesSquare,
  ThumbsUp,
  ThumbsDown,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Source {
  scope: string;
  label: string;
  bad: number;
  good: number;
}

interface DailyBucket {
  day: string;
  bad: number;
  good: number;
}

interface LeaderboardRow {
  userId: string;
  name: string;
  bad: number;
  good: number;
  total: number;
}

interface Payload {
  totals: { bad: number; good: number; total: number };
  sources: Source[];
  dailyTrend: DailyBucket[];
  leaderboard: LeaderboardRow[];
}

export default function FeedbackDashboardPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/intelligence/feedback");
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
  }, []);

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

  const disagreementRate =
    data.totals.total > 0
      ? Math.round((data.totals.bad / data.totals.total) * 100)
      : 0;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <MessagesSquare className="h-6 w-6 text-indigo-500" />
          Feedback collectif
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Vue unifiée des 6 boucles de feedback explicite. Les techs
          corrigent le modèle en temps réel via les boutons 👍 / 👎 sur
          chaque suggestion.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi
          label="Feedbacks 30j"
          value={String(data.totals.total)}
        />
        <Kpi
          label="Bons feedbacks"
          value={String(data.totals.good)}
          tone="good"
          icon={<ThumbsUp className="h-4 w-4 text-emerald-500" />}
        />
        <Kpi
          label="Mauvais feedbacks"
          value={String(data.totals.bad)}
          tone="bad"
          icon={<ThumbsDown className="h-4 w-4 text-rose-500" />}
        />
        <Kpi
          label="Taux désaccord"
          value={`${disagreementRate}%`}
          tone={
            disagreementRate > 40
              ? "bad"
              : disagreementRate > 20
                ? "warn"
                : "good"
          }
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
          Volume total par jour (30 derniers jours)
        </h2>
        {data.dailyTrend.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Pas encore de feedback cette période.
          </p>
        ) : (
          <DualBarChart data={data.dailyTrend} />
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
          Répartition par feature
        </h2>
        <ul className="space-y-2">
          {data.sources.map((s) => {
            const total = s.bad + s.good;
            const disRate =
              total > 0 ? Math.round((s.bad / total) * 100) : 0;
            return (
              <li
                key={s.scope}
                className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/30"
              >
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                  {s.label}
                </span>
                <span className="text-xs text-rose-600 dark:text-rose-400">
                  <ThumbsDown className="mr-0.5 inline h-3 w-3" />
                  {s.bad}
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  <ThumbsUp className="mr-0.5 inline h-3 w-3" />
                  {s.good}
                </span>
                <DisBar value={disRate} total={total} />
                <span className="w-10 text-right text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                  {disRate}%
                </span>
                <DrillLink scope={s.scope} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          <Trophy className="h-4 w-4 text-amber-500" />
          Top contributeurs
        </h2>
        {data.leaderboard.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Aucun contributeur dans cette fenêtre.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.leaderboard.map((u, i) => (
              <li
                key={u.userId}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    i === 0
                      ? "bg-amber-200 text-amber-900"
                      : i === 1
                        ? "bg-slate-200 text-slate-800"
                        : i === 2
                          ? "bg-orange-200 text-orange-900"
                          : "bg-slate-100 text-slate-600",
                  )}
                >
                  {i + 1}
                </span>
                <Link
                  href={`/intelligence/techs/${u.userId}`}
                  className="flex-1 truncate text-sm font-medium text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                >
                  {u.name}
                </Link>
                <span className="text-xs text-rose-600 dark:text-rose-400">
                  <ThumbsDown className="mr-0.5 inline h-3 w-3" />
                  {u.bad}
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  <ThumbsUp className="mr-0.5 inline h-3 w-3" />
                  {u.good}
                </span>
                <span className="w-8 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                  {u.total}
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

function DisBar({ value, total }: { value: number; total: number }) {
  if (total === 0) {
    return (
      <div className="h-1.5 w-24 rounded-full bg-slate-100 dark:bg-slate-800" />
    );
  }
  const color =
    value > 40 ? "bg-rose-500" : value > 20 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className={cn("h-full", color)}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function DrillLink({ scope }: { scope: string }) {
  const map: Record<string, string> = {
    "similar:feedback": "/intelligence/similar-learning",
    "category:feedback": "/intelligence/category-learning",
  };
  const href = map[scope];
  if (!href) return <span className="w-16" aria-hidden />;
  return (
    <Link
      href={href}
      className="shrink-0 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
    >
      Détails →
    </Link>
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
              >
                <title>
                  {d.day} · {d.good} 👍 · {d.bad} 👎
                </title>
              </rect>
              <rect
                x={x + 2}
                y={h - goodH - badH}
                width={barW - 4}
                height={badH}
                className="fill-rose-500"
              >
                <title>
                  {d.day} · {d.good} 👍 · {d.bad} 👎
                </title>
              </rect>
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
