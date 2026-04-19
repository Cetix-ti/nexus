"use client";

// ============================================================================
// /intelligence/features/[feature] — Drill-down d'une feature IA auditée.
// Expose la santé agrégée, les patterns appris actifs, la guidance prompt
// injectée runtime, et 25 cas récents où le juge a été en désaccord.
// ============================================================================

import { use as usePromise, useEffect, useState } from "react";
import Link from "next/link";
import {
  Gauge,
  Loader2,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthSummary {
  agreementRate?: number;
  recentRate7d?: number | null;
  trend?: number | null;
  totalAudits?: number;
}

interface DailyBucket {
  day: string;
  agreementRate: number;
  total: number;
}

interface Pattern {
  key: string;
  data: string;
  sampleCount: number;
  confidence: number;
  metaStatus: string | null;
  updatedAt: string;
}

interface Guidance {
  additions?: string[];
  antiExamples?: string[];
  generatedAt?: string;
  basedOnCases?: number;
}

interface Case {
  auditId: string;
  verdict: "disagree" | "partial";
  judgeConfidence: number;
  reasoning: string;
  suggestion: string | null;
  createdAt: string;
  ticketId: string | null;
  ticketNumber: number | null;
  ticketSubject: string | null;
  currentCategoryName: string | null;
  modelResponsePreview: string | null;
}

interface Payload {
  feature: string;
  health: {
    summary: HealthSummary | null;
    updatedAt: string | null;
  };
  stats: {
    totalAudits: number;
    agreed: number;
    disagreed: number;
    partial: number;
    agreementRate: number;
  };
  dailyTrend: DailyBucket[];
  learnedPatterns: Record<string, Pattern[]>;
  guidance: { value: Guidance | null; updatedAt: string | null };
  disagreementCases: Case[];
}

export default function FeatureDetailPage({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = usePromise(params);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/intelligence/features/${feature}`,
        );
        if (!res.ok) {
          setError(res.status === 400 ? "Feature inconnue" : "Erreur");
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
  }, [feature]);

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
          <span>Features</span>
        </div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <Gauge className="h-6 w-6 text-emerald-500" />
          {data.feature}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Audit : gpt-4o-mini évalue les décisions du modèle local (gemma3)
          et alimente automatiquement les patterns appris + la guidance
          runtime.
        </p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi
          label="Agreement rate 30j"
          value={`${Math.round(data.stats.agreementRate * 100)}%`}
          tone={
            data.stats.agreementRate >= 0.8
              ? "good"
              : data.stats.agreementRate >= 0.6
                ? "warn"
                : "bad"
          }
        />
        <Kpi label="Total audits" value={String(data.stats.totalAudits)} />
        <Kpi
          label="Désaccords"
          value={String(data.stats.disagreed)}
          tone={data.stats.disagreed > data.stats.totalAudits * 0.2 ? "warn" : undefined}
        />
        <Kpi label="Partiels" value={String(data.stats.partial)} />
      </div>

      {/* Trend chart */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
          Agreement rate jour par jour (30 derniers jours)
        </h2>
        {data.dailyTrend.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-slate-400">
            Pas encore assez de données.
          </p>
        ) : (
          <TrendChart data={data.dailyTrend} />
        )}
      </section>

      {/* Guidance active */}
      <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <h2 className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
            Guidance prompt injectée runtime
          </h2>
          {data.guidance.updatedAt && (
            <span className="ml-auto text-[10px] text-indigo-600/70 dark:text-indigo-400/70">
              maj{" "}
              {new Date(data.guidance.updatedAt).toLocaleDateString("fr-CA")}
            </span>
          )}
        </div>
        {data.guidance.value &&
        (data.guidance.value.additions?.length ||
          data.guidance.value.antiExamples?.length) ? (
          <div className="space-y-3 text-sm">
            {data.guidance.value.additions &&
              data.guidance.value.additions.length > 0 && (
                <div>
                  <h3 className="mb-1 text-[10px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                    Règles ajoutées
                  </h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-200">
                    {data.guidance.value.additions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            {data.guidance.value.antiExamples &&
              data.guidance.value.antiExamples.length > 0 && (
                <div>
                  <h3 className="mb-1 text-[10px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                    Anti-exemples
                  </h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-200">
                    {data.guidance.value.antiExamples.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            {data.guidance.value.basedOnCases !== undefined && (
              <p className="text-[10px] italic text-indigo-700/80 dark:text-indigo-400/80">
                Dérivé de {data.guidance.value.basedOnCases} cas
                d&apos;échec analysés par gpt-4o-mini.
              </p>
            )}
          </div>
        ) : (
          <p className="py-3 text-xs italic text-indigo-700/70 dark:text-indigo-400/70">
            Aucune guidance active. Le job `prompt-evolution` en écrira une
            dès que ≥ 8 désaccords auront été accumulés.
          </p>
        )}
      </section>

      {/* Learned patterns */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
          Patterns appris actifs
        </h2>
        {Object.keys(data.learnedPatterns).length === 0 ? (
          <p className="py-3 text-xs italic text-slate-400">
            Aucun pattern auto-appris pour cette feature.
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(data.learnedPatterns).map(([kind, items]) => (
              <div key={kind}>
                <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                  {kindLabel(kind)} ({items.length})
                </h3>
                <ul className="space-y-1">
                  {items.map((p) => (
                    <li
                      key={p.key}
                      className={cn(
                        "flex items-center gap-2 rounded px-2 py-1 text-xs",
                        p.metaStatus === "harmful"
                          ? "bg-slate-100 text-slate-400 line-through dark:bg-slate-800"
                          : p.metaStatus === "beneficial"
                            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-slate-50 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
                      )}
                    >
                      <span className="font-mono">{p.data}</span>
                      <span className="ml-auto text-[10px] text-slate-400">
                        ×{p.sampleCount} · conf {Math.round(p.confidence * 100)}%
                        {p.metaStatus && (
                          <span className="ml-1">· {p.metaStatus}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Disagreement cases */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Cas de désaccord récents ({data.disagreementCases.length})
        </h2>
        {data.disagreementCases.length === 0 ? (
          <p className="py-6 text-center text-xs italic text-slate-400">
            Aucun désaccord récent — belle performance du modèle.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.disagreementCases.map((c) => (
              <li
                key={c.auditId}
                className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start gap-2">
                  <VerdictIcon verdict={c.verdict} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {c.ticketNumber && c.ticketId ? (
                        <Link
                          href={`/tickets/${c.ticketId}`}
                          className="font-mono text-xs font-medium text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
                        >
                          TK-{c.ticketNumber}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">
                          (ticket supprimé)
                        </span>
                      )}
                      {c.ticketSubject && (
                        <span className="truncate text-sm text-slate-800 dark:text-slate-100">
                          {c.ticketSubject}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                        {new Date(c.createdAt).toLocaleString("fr-CA", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {c.currentCategoryName && (
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Catégorie actuelle : {c.currentCategoryName}
                      </div>
                    )}
                    <div className="mt-2">
                      <h4 className="text-[10px] uppercase tracking-wide text-slate-500">
                        Raisonnement du juge (confiance{" "}
                        {Math.round(c.judgeConfidence * 100)}%)
                      </h4>
                      <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
                        {c.reasoning}
                      </p>
                    </div>
                    {c.suggestion && (
                      <div className="mt-2 rounded bg-indigo-50 p-2 dark:bg-indigo-950/50">
                        <h4 className="text-[10px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                          Suggestion
                        </h4>
                        <p className="mt-0.5 text-xs text-indigo-800 dark:text-indigo-200">
                          {c.suggestion}
                        </p>
                      </div>
                    )}
                    {c.modelResponsePreview && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-slate-400 hover:text-slate-600">
                          Réponse brute du modèle local
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {c.modelResponsePreview}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
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

function TrendChart({ data }: { data: DailyBucket[] }) {
  if (data.length === 0) return null;
  const w = 720;
  const h = 100;
  const points = data.map((d, i) => {
    const x = (i / Math.max(1, data.length - 1)) * w;
    const y = h - d.agreementRate * h;
    return `${x},${y}`;
  });
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
        {/* Baseline 80% */}
        <line
          x1={0}
          y1={h * 0.2}
          x2={w}
          y2={h * 0.2}
          strokeDasharray="2,2"
          className="stroke-emerald-300 dark:stroke-emerald-800"
          strokeWidth="1"
        />
        <line
          x1={0}
          y1={h * 0.4}
          x2={w}
          y2={h * 0.4}
          strokeDasharray="2,2"
          className="stroke-amber-300 dark:stroke-amber-800"
          strokeWidth="1"
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-indigo-500"
        />
        {data.map((d, i) => (
          <circle
            key={d.day}
            cx={(i / Math.max(1, data.length - 1)) * w}
            cy={h - d.agreementRate * h}
            r="2"
            className="fill-indigo-500"
          >
            <title>
              {d.day} — {Math.round(d.agreementRate * 100)}% ({d.total} audits)
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{data[0]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function VerdictIcon({ verdict }: { verdict: "disagree" | "partial" }) {
  if (verdict === "disagree") {
    return (
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
    );
  }
  return (
    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "add_sanity_stop":
      return "Mots génériques exclus";
    case "category_mapping":
      return "Mappings catégorie forcés";
    case "confidence_penalty":
      return "Pénalités de confiance";
    default:
      return kind;
  }
}
