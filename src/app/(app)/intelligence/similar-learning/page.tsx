"use client";

// ============================================================================
// /intelligence/similar-learning — État de l'apprentissage du widget Tickets
// similaires. Tokens pénalisés, volume de feedback, top paires mauvaises.
// L'admin peut libérer manuellement un token qui serait pénalisé à tort.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Unlock,
  TicketIcon,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Penalty {
  token: string;
  badCount: number;
  goodCount: number;
  penaltyStrength: number;
  sampleCount: number;
  learnedAt: string;
  updatedAt: string;
}

interface DailyBucket {
  day: string;
  bad: number;
  good: number;
}

interface TopPair {
  source: { id: string; number: number; subject: string };
  suggested: { id: string; number: number; subject: string };
  badCount: number;
  goodCount: number;
}

interface Payload {
  penalties: Penalty[];
  dailyTrend: DailyBucket[];
  totals: { bad: number; good: number; total: number };
  topPairs: TopPair[];
}

export default function SimilarLearningPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyToken, setBusyToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/intelligence/similar-learning");
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

  const handleRelease = async (token: string) => {
    setBusyToken(token);
    try {
      const res = await fetch(
        "/api/v1/intelligence/similar-learning/release",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );
      if (res.ok) void load();
    } finally {
      setBusyToken(null);
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
          <TrendingDown className="h-6 w-6 text-rose-500" />
          Apprentissage — tickets similaires
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Le widget « Tickets similaires » apprend des thumbs-up / thumbs-down
          des techs. Les tokens qui causent trop de faux positifs sont
          progressivement pénalisés dans le scoring.
        </p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi
          label="Feedback 30j"
          value={String(data.totals.total)}
        />
        <Kpi
          label="Bad matches"
          value={String(data.totals.bad)}
          icon={<ThumbsDown className="h-4 w-4 text-rose-500" />}
          tone="bad"
        />
        <Kpi
          label="Good matches"
          value={String(data.totals.good)}
          icon={<ThumbsUp className="h-4 w-4 text-emerald-500" />}
          tone="good"
        />
        <Kpi
          label="Tokens pénalisés"
          value={String(data.penalties.length)}
        />
      </div>

      {/* Daily chart */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
          Volume de feedback par jour (30 derniers jours)
        </h2>
        {data.dailyTrend.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Pas encore de feedback dans cette fenêtre.
          </p>
        ) : (
          <DualBarChart data={data.dailyTrend} />
        )}
      </section>

      {/* Penalty tokens */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
          Tokens pénalisés ({data.penalties.length})
        </h2>
        {data.penalties.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Aucun token pénalisé. Les feedbacks thumbs-down sont en cours
            d&apos;accumulation ; le learner tourne toutes les 6 h.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.penalties.map((p) => (
              <li
                key={p.token}
                className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/30"
              >
                <span className="font-mono text-sm font-medium text-slate-800 dark:text-slate-100">
                  {p.token}
                </span>
                <span className="text-xs text-rose-600 dark:text-rose-400">
                  <ThumbsDown className="mr-0.5 inline h-3 w-3" />
                  {p.badCount}
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  <ThumbsUp className="mr-0.5 inline h-3 w-3" />
                  {p.goodCount}
                </span>
                <PenaltyBar value={p.penaltyStrength} />
                <span className="text-[10px] text-slate-400">
                  maj {new Date(p.updatedAt).toLocaleDateString("fr-CA")}
                </span>
                <button
                  type="button"
                  disabled={busyToken === p.token}
                  onClick={() => handleRelease(p.token)}
                  className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  title="Libérer cette pénalité — si tu juges que ce token est légitime"
                >
                  {busyToken === p.token ? (
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

      {/* Top bad pairs */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
          Paires les plus signalées
        </h2>
        {data.topPairs.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Aucune paire récurrente — les feedbacks sont dispersés.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.topPairs.map((p, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-800/30"
              >
                <Link
                  href={`/tickets/${p.source.id}`}
                  className="inline-flex items-center gap-1 text-slate-700 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
                >
                  <TicketIcon className="h-3 w-3" />
                  <span className="font-mono text-xs">TK-{p.source.number}</span>
                  <span className="max-w-[240px] truncate text-xs">
                    {p.source.subject}
                  </span>
                </Link>
                <span className="text-slate-400">↔</span>
                <Link
                  href={`/tickets/${p.suggested.id}`}
                  className="inline-flex items-center gap-1 text-slate-700 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
                >
                  <TicketIcon className="h-3 w-3" />
                  <span className="font-mono text-xs">
                    TK-{p.suggested.number}
                  </span>
                  <span className="max-w-[240px] truncate text-xs">
                    {p.suggested.subject}
                  </span>
                </Link>
                <span className="ml-auto text-xs text-rose-600 dark:text-rose-400">
                  <ThumbsDown className="mr-0.5 inline h-3 w-3" />
                  {p.badCount}
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
              >
                <title>
                  {d.day} · {d.good} thumbs-up · {d.bad} thumbs-down
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
                  {d.day} · {d.good} thumbs-up · {d.bad} thumbs-down
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
