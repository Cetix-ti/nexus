"use client";

// ============================================================================
// /intelligence/clients/[id] — Vue 360° d'un client alimentée par les jobs
// d'auto-apprentissage. Super-admin / msp-admin.
// ============================================================================

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import {
  Loader2,
  Building2,
  Clock,
  AlertTriangle,
  Wrench,
  Ticket as TicketIcon,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Repeat,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryPoint {
  at: string;
  score: number;
}

interface Breakdown {
  ticketing: number;
  security: number;
  backups: number;
  responsiveness: number;
  riskTrend: number;
}

interface HealthCurrent {
  score: number;
  breakdown: Breakdown;
  signals: Record<string, number | string | null>;
  evaluatedAt: string;
}

interface HealthRecord {
  current: HealthCurrent;
  previous7dScore: number | null;
  history: HistoryPoint[];
}

interface ImplicitSlaStats {
  p50: number;
  p75: number;
  p90: number;
  sample: number;
}

interface ImplicitSla {
  sampleSize: number;
  firstResponse: ImplicitSlaStats | null;
  resolution: ImplicitSlaStats | null;
  byPriority: Record<
    string,
    {
      firstResponse: ImplicitSlaStats | null;
      resolution: ImplicitSlaStats | null;
    }
  >;
  hasExplicitSlaPolicy: boolean;
}

interface Anomaly {
  severity: "low" | "medium" | "high";
  contactEmail: string;
  signals: string[];
  detectedAt: string;
}

interface SlaRisk {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  riskScore: number;
  reasons: string[];
}

interface Maintenance {
  suggestionId: string;
  title: string;
  clientImpact: "low" | "medium" | "high";
  estimatedEffort: string;
}

interface RecurringPattern {
  clusterSize?: number;
  spanDays?: number;
  exampleSubjects?: string[];
}

interface VocabularyFact {
  content: string;
  source: string | null;
}

interface Payload {
  org: { id: string; name: string };
  health: HealthRecord | null;
  healthUpdatedAt: string | null;
  implicitSla: ImplicitSla | null;
  recurringPatterns: RecurringPattern[];
  maintenanceSuggestions: Maintenance[];
  requesterAnomalies: Anomaly[];
  slaRisks: SlaRisk[];
  vocabulary: VocabularyFact[];
  kpis: { openTickets: number; resolved30d: number; created30d: number };
}

export default function Client360Page({
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
        const res = await fetch(`/api/v1/intelligence/clients/${id}`);
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

  const currentScore = data.health?.current.score ?? 100;
  const prevScore = data.health?.previous7dScore ?? null;
  const trend =
    prevScore !== null ? currentScore - prevScore : null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Building2 className="h-4 w-4" />
            <Link href="/intelligence" className="hover:text-indigo-600">
              Intelligence
            </Link>
            <span>›</span>
            <span>Clients</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {data.org.name}
          </h1>
          {data.healthUpdatedAt && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Santé évaluée le{" "}
              {new Date(data.healthUpdatedAt).toLocaleString("fr-CA")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <ScoreBigRing value={currentScore} trend={trend} />
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Tickets ouverts" value={data.kpis.openTickets} />
        <Kpi label="Créés (30j)" value={data.kpis.created30d} />
        <Kpi label="Résolus (30j)" value={data.kpis.resolved30d} />
      </div>

      {/* Breakdown + History */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Composantes du score" hint="Pénalités soustraites d'un baseline 100.">
          {data.health ? (
            <BreakdownList breakdown={data.health.current.breakdown} />
          ) : (
            <Empty>Score pas encore calculé.</Empty>
          )}
        </SectionCard>

        <SectionCard title="Historique (30 derniers snapshots)" icon={<TrendingUp className="h-4 w-4 text-blue-500" />}>
          {data.health?.history.length ? (
            <SparklineCard history={data.health.history} />
          ) : (
            <Empty>Pas encore de données historiques.</Empty>
          )}
        </SectionCard>

        <SectionCard
          title="SLA implicite appris"
          icon={<Clock className="h-4 w-4 text-orange-500" />}
          hint="Calculé sur 180j de tickets résolus. Indicatif — pas un engagement contractuel."
        >
          {data.implicitSla ? (
            <SlaList sla={data.implicitSla} />
          ) : (
            <Empty>Historique insuffisant pour un SLA fiable.</Empty>
          )}
        </SectionCard>
      </div>

      {/* Risks + Anomalies */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title={`Tickets à risque SLA (${data.slaRisks.length})`}
          icon={<Clock className="h-4 w-4 text-rose-500" />}
        >
          {data.slaRisks.length === 0 ? (
            <Empty>Tous les tickets sous contrôle.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.slaRisks.slice(0, 6).map((r) => (
                <li key={r.ticketId} className="flex items-start gap-2">
                  <RiskDot value={r.riskScore} />
                  <Link
                    href={`/tickets/${r.ticketId}`}
                    className="block min-w-0 flex-1"
                  >
                    <div className="truncate text-sm font-medium text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">
                      TK-{r.ticketNumber} — {r.subject}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {r.reasons[0] ?? ""}
                    </div>
                  </Link>
                  <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                    {Math.round(r.riskScore * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={`Anomalies requester (${data.requesterAnomalies.length})`}
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
        >
          {data.requesterAnomalies.length === 0 ? (
            <Empty>Aucune anomalie.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.requesterAnomalies.slice(0, 6).map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <SeverityDot severity={a.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {a.contactEmail}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {a.signals[0] ?? ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {new Date(a.detectedAt).toLocaleDateString("fr-CA", {
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Maintenance + Recurring + Vocabulary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title={`Maintenance proposée (${data.maintenanceSuggestions.length})`}
          icon={<Wrench className="h-4 w-4 text-purple-500" />}
          href="/intelligence/maintenance"
        >
          {data.maintenanceSuggestions.length === 0 ? (
            <Empty>Aucune suggestion.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.maintenanceSuggestions.slice(0, 5).map((m) => (
                <li
                  key={m.suggestionId}
                  className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200"
                >
                  <ImpactBadge impact={m.clientImpact} />
                  <span className="flex-1 truncate">{m.title}</span>
                  <span className="rounded border border-slate-300 px-1 py-px text-[9px] dark:border-slate-600">
                    {m.estimatedEffort}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={`Patterns récurrents (${data.recurringPatterns.length})`}
          icon={<Repeat className="h-4 w-4 text-indigo-500" />}
        >
          {data.recurringPatterns.length === 0 ? (
            <Empty>Aucun pattern détecté.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.recurringPatterns.slice(0, 5).map((p, i) => {
                const subj = Array.isArray(p.exampleSubjects)
                  ? p.exampleSubjects.slice(0, 1).join("")
                  : "";
                return (
                  <li key={i} className="text-sm text-slate-700 dark:text-slate-200">
                    <div className="truncate">{subj || "(sujet varié)"}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {p.clusterSize ?? 0} occurrences · {p.spanDays ?? 0} jours
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={`Vocabulaire technique (${data.vocabulary.length})`}
          icon={<Languages className="h-4 w-4 text-emerald-500" />}
          hint="Termes techniques propres à ce client, appris automatiquement depuis les tickets."
        >
          {data.vocabulary.length === 0 ? (
            <Empty>Pas encore de vocabulaire extrait.</Empty>
          ) : (
            <ul className="space-y-1">
              {data.vocabulary.slice(0, 8).map((v, i) => (
                <li
                  key={i}
                  className="text-xs text-slate-700 dark:text-slate-200"
                  title={v.source ?? ""}
                >
                  • {v.content.slice(0, 120)}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  icon,
  hint,
  href,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  hint?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        {icon}
        {href ? (
          <Link
            href={href}
            className="text-sm font-medium text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
          >
            {title}
          </Link>
        ) : (
          <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {title}
          </h2>
        )}
        {hint && (
          <span
            className="ml-auto cursor-help text-xs text-slate-400 dark:text-slate-500"
            title={hint}
          >
            ?
          </span>
        )}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-4 text-center text-xs italic text-slate-400 dark:text-slate-500">
      {children}
    </p>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function BreakdownList({ breakdown }: { breakdown: Breakdown }) {
  const rows: Array<{ key: keyof Breakdown; label: string }> = [
    { key: "ticketing", label: "Ticketing" },
    { key: "security", label: "Sécurité" },
    { key: "backups", label: "Backups" },
    { key: "responsiveness", label: "Réactivité" },
    { key: "riskTrend", label: "Tendance risque" },
  ];
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const v = breakdown[r.key] ?? 0;
        return (
          <li key={r.key} className="flex items-center gap-2">
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">
              {r.label}
            </span>
            <span
              className={cn(
                "w-12 text-right text-xs font-medium tabular-nums",
                v === 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            >
              {v}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SparklineCard({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) {
    return <Empty>Au moins 2 snapshots nécessaires.</Empty>;
  }
  const maxScore = 100;
  const w = 280;
  const h = 60;
  const points = history.map((p, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - (p.score / maxScore) * h;
    return `${x},${y}`;
  });
  const latest = history[history.length - 1];
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full">
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-indigo-500"
        />
        <circle
          cx={(w * (history.length - 1)) / (history.length - 1)}
          cy={h - (latest.score / maxScore) * h}
          r="3"
          className="fill-indigo-500"
        />
      </svg>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {history.length} points · min{" "}
        {Math.min(...history.map((p) => p.score))} · max{" "}
        {Math.max(...history.map((p) => p.score))}
      </p>
    </div>
  );
}

function SlaList({ sla }: { sla: ImplicitSla }) {
  const rows: Array<{ key: "firstResponse" | "resolution"; label: string }> = [
    { key: "firstResponse", label: "1re réponse" },
    { key: "resolution", label: "Résolution" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const stats = sla[r.key];
        if (!stats) return null;
        return (
          <div key={r.key} className="text-sm">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-slate-700 dark:text-slate-200">
                {r.label}
              </span>
              <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                médiane {formatMinutes(stats.p50)} · p75{" "}
                {formatMinutes(stats.p75)}
              </span>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] italic text-slate-400">
        Basé sur {sla.sampleSize} tickets.{" "}
        {sla.hasExplicitSlaPolicy ? "SLA formel attaché." : "Aucune SLAPolicy formelle."}
      </p>
    </div>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem > 0 ? `${h}h${rem}` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}j${h % 24 > 0 ? ` ${h % 24}h` : ""}`;
}

function ScoreBigRing({
  value,
  trend,
}: {
  value: number;
  trend: number | null;
}) {
  const color =
    value >= 80
      ? "text-emerald-500 border-emerald-500"
      : value >= 60
        ? "text-amber-500 border-amber-500"
        : "text-rose-500 border-rose-500";
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full border-4 text-xl font-semibold tabular-nums",
          color,
        )}
      >
        {value}
      </div>
      {trend !== null && trend !== 0 && (
        <div
          className={cn(
            "flex items-center gap-1 text-sm font-medium",
            trend > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400",
          )}
        >
          {trend > 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          {trend > 0 ? "+" : ""}
          {trend} pts /7j
        </div>
      )}
    </div>
  );
}

function RiskDot({ value }: { value: number }) {
  const color =
    value >= 0.85 ? "bg-rose-500" : value >= 0.6 ? "bg-amber-500" : "bg-slate-400";
  return <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", color)} />;
}

function SeverityDot({
  severity,
}: {
  severity: "low" | "medium" | "high";
}) {
  const color =
    severity === "high"
      ? "bg-rose-500"
      : severity === "medium"
        ? "bg-amber-500"
        : "bg-slate-400";
  return <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", color)} />;
}

function ImpactBadge({ impact }: { impact: "low" | "medium" | "high" }) {
  const map = {
    high: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span
      className={cn(
        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
        map[impact],
      )}
    >
      {impact === "high" ? "Fort" : impact === "medium" ? "Moyen" : "Faible"}
    </span>
  );
}
