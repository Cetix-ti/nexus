"use client";

// ============================================================================
// /intelligence — Dashboard d'auto-apprentissage Nexus (SUPER_ADMIN / MSP_ADMIN).
//
// Surface l'output des 26+ jobs en arrière-plan :
//   - Feature health (agreement rate IA locale vs juge OpenAI)
//   - KB gaps — catégories où la KB manque d'articles
//   - Maintenance suggestions — opportunités préventives
//   - Client health — scores 0-100 pour chaque org
//   - SLA risks — tickets à risque de breach
//   - Requester anomalies — comportements inhabituels
//   - Budget tracker — conso IA du jour
//   - Digital twin — courbe précision globale
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  Building2,
  Clock,
  DollarSign,
  Gauge,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wrench,
  Zap,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureHealth {
  feature: string;
  agreementRate: number;
  recentRate7d: number | null;
  trend: number | null;
  totalAudits: number;
}

interface KbGap {
  categoryId: string;
  categoryName?: string;
  categoryPath?: string;
  impactedTickets: number;
  disagreementRate: number;
  kbCoverage: number;
  priority: number;
}

interface MaintenanceSuggestion {
  suggestionId?: string;
  title?: string;
  rationale?: string;
  clientImpact?: string;
  estimatedEffort?: string;
  organizationId?: string;
}

interface ClientHealthRow {
  orgId: string;
  orgName: string;
  score: number;
  previous7dScore: number | null;
  breakdown: Record<string, number> | null;
}

interface SlaRisk {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  riskScore: number;
  reasons: string[];
  assigneeName?: string;
}

interface RequesterAnomaly {
  contactEmail: string;
  organizationName: string;
  severity: "low" | "medium" | "high";
  signals: string[];
  detectedAt: string;
  affectedTicketIds: string[];
}

interface BudgetRow {
  feature: string;
  usageCents: number;
  budgetCents: number;
  pctUsed: number;
}

interface DigitalTwinRun {
  runAt: string;
  accuracy: number;
  looseAccuracy: number;
  sampled: number;
}

interface OverviewPayload {
  featureHealth: FeatureHealth[];
  kbGaps: KbGap[];
  maintenanceSuggestions: MaintenanceSuggestion[];
  clientHealth: {
    worst: ClientHealthRow[];
    best: ClientHealthRow[];
    total: number;
  };
  slaRisks: SlaRisk[];
  requesterAnomalies: RequesterAnomaly[];
  budget: BudgetRow[];
  digitalTwin: DigitalTwinRun[];
  counts: {
    dedupClusters: number;
    securityChains: number;
    threadRecaps: number;
    harmfulPatterns: number;
  };
  generatedAt: string;
}

export default function IntelligencePage() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/v1/intelligence/overview");
        if (!res.ok) {
          setError(res.status === 403 ? "Accès réservé aux admins" : "Erreur de chargement");
          return;
        }
        setData((await res.json()) as OverviewPayload);
      } catch {
        setError("Connexion impossible");
      } finally {
        setLoading(false);
      }
    };
    void load();
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
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {error ?? "Données indisponibles"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            <Brain className="h-6 w-6 text-indigo-500" />
            Intelligence autonome
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Synthèse des {26} systèmes d&apos;auto-apprentissage. Généré le{" "}
            {new Date(data.generatedAt).toLocaleString("fr-CA")}.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <MetaCount label="Dedup clusters" value={data.counts.dedupClusters} />
          <MetaCount label="Chaînes sécurité" value={data.counts.securityChains} />
          <MetaCount label="Threads consolidés" value={data.counts.threadRecaps} />
          <MetaCount
            label="Patterns neutralisés"
            value={data.counts.harmfulPatterns}
            highlight={data.counts.harmfulPatterns > 0}
          />
        </div>
      </header>

      {/* GRID 1 — Feature health + Digital twin */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Qualité par feature IA"
          icon={<Gauge className="h-4 w-4 text-emerald-500" />}
          hint="Agreement rate juge OpenAI vs modèle local (30j). Trend = 7j vs 30j."
        >
          {data.featureHealth.length === 0 ? (
            <Empty>Aucun audit IA encore fait.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.featureHealth.map((f) => (
                <li key={f.feature}>
                  <Link
                    href={`/intelligence/features/${f.feature}`}
                    className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                      {f.feature}
                    </span>
                    <AgreementBar value={f.agreementRate} />
                    {f.trend !== null && f.trend !== 0 && (
                      <TrendBadge delta={f.trend} />
                    )}
                    <span className="ml-1 text-[10px] tabular-nums text-slate-400">
                      {f.totalAudits}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Digital twin — précision historique"
          icon={<Activity className="h-4 w-4 text-blue-500" />}
          hint="15 tickets rejoués/semaine. Comparé à la catégorie humaine validée."
        >
          {data.digitalTwin.length === 0 ? (
            <Empty>Pas encore de run digital twin.</Empty>
          ) : (
            <div className="space-y-3">
              <div className="flex items-end gap-1">
                {data.digitalTwin.map((r) => (
                  <div
                    key={r.runAt}
                    className="flex min-w-0 flex-1 flex-col items-center"
                    title={`${new Date(r.runAt).toLocaleDateString("fr-CA")} • précision ${(r.accuracy * 100).toFixed(0)}%`}
                  >
                    <div
                      className="w-full rounded-t bg-blue-500"
                      style={{
                        height: `${Math.max(4, r.accuracy * 60)}px`,
                      }}
                    />
                    <span className="mt-1 text-[9px] text-slate-400">
                      {new Date(r.runAt).toLocaleDateString("fr-CA", {
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
              {data.digitalTwin.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Dernier run :{" "}
                  <strong>
                    {(data.digitalTwin[data.digitalTwin.length - 1].accuracy * 100).toFixed(0)}
                    %
                  </strong>{" "}
                  ({data.digitalTwin[data.digitalTwin.length - 1].sampled} tickets)
                </p>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Budget IA — conso aujourd'hui"
          icon={<DollarSign className="h-4 w-4 text-amber-500" />}
          hint="Pourcentage du budget quotidien (env `AI_BUDGET_<feature>`)."
        >
          {data.budget.length === 0 ? (
            <Empty>Aucune activité IA aujourd&apos;hui.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.budget.slice(0, 8).map((b) => (
                <li key={b.feature} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                    {b.feature}
                  </span>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={cn(
                        "h-full",
                        b.pctUsed >= 100
                          ? "bg-rose-500"
                          : b.pctUsed >= 75
                            ? "bg-amber-500"
                            : "bg-emerald-500",
                      )}
                      style={{ width: `${Math.min(100, b.pctUsed)}%` }}
                    />
                  </div>
                  <span className="ml-1 w-10 text-right text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                    {b.pctUsed}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* GRID 2 — Client health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Clients à risque"
          icon={<Building2 className="h-4 w-4 text-rose-500" />}
          hint="Score 0-100 agrégé : ticketing 35%, security 30%, backups 15%, resp. 10%, trend 10%."
        >
          {data.clientHealth.worst.length === 0 ? (
            <Empty>Aucun snapshot de santé encore calculé.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.clientHealth.worst.map((c) => (
                <li key={c.orgId}>
                  <Link
                    href={`/intelligence/clients/${c.orgId}`}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <ScoreRing value={c.score} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {c.orgName}
                      </div>
                      {c.previous7dScore !== null && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          il y a 7j :{" "}
                          <span className="tabular-nums">{c.previous7dScore}</span>
                          {c.score < c.previous7dScore - 5 && (
                            <span className="ml-1 font-medium text-rose-600 dark:text-rose-400">
                              ▼ {c.previous7dScore - c.score}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Clients en bonne santé"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        >
          {data.clientHealth.best.length === 0 ? (
            <Empty>Pas encore de données.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.clientHealth.best.map((c) => (
                <li key={c.orgId}>
                  <Link
                    href={`/intelligence/clients/${c.orgId}`}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <ScoreRing value={c.score} />
                    <div className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                      {c.orgName}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* GRID 3 — SLA risks + Requester anomalies */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title={`Tickets à risque SLA (${data.slaRisks.length})`}
          icon={<Clock className="h-4 w-4 text-orange-500" />}
        >
          {data.slaRisks.length === 0 ? (
            <Empty>Tous les tickets sous contrôle.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.slaRisks.slice(0, 8).map((r) => (
                <li key={r.ticketId} className="flex items-start gap-2">
                  <RiskDot value={r.riskScore} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/tickets/${r.ticketId}`}
                      className="block truncate text-sm font-medium text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                    >
                      TK-{r.ticketNumber} — {r.subject}
                    </Link>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {r.reasons[0] ?? ""}
                    </div>
                  </div>
                  <span className="ml-1 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
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
          hint="Comportements inhabituels : spikes, horaires, catégories étrangères."
          href="/intelligence/anomalies"
        >
          {data.requesterAnomalies.length === 0 ? (
            <Empty>Aucune anomalie détectée récemment.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.requesterAnomalies.slice(0, 6).map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <SeverityDot severity={a.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {a.contactEmail}{" "}
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        · {a.organizationName}
                      </span>
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {a.signals[0] ?? ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {new Date(a.detectedAt).toLocaleString("fr-CA", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* GRID 4 — KB gaps + Maintenance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Articles KB à écrire"
          icon={<BookOpen className="h-4 w-4 text-indigo-500" />}
          hint="Catégories où l'IA se plante souvent ET où aucun article KB n'est aligné. Voir aussi /intelligence/kb-proposed pour valider les brouillons IA."
          href="/intelligence/kb-gaps"
          extraHref="/intelligence/kb-proposed"
          extraLabel="Articles proposés →"
        >
          {data.kbGaps.length === 0 ? (
            <Empty>Pas de lacune KB détectée.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.kbGaps.slice(0, 6).map((g) => (
                <li key={g.categoryId} className="flex items-start gap-2">
                  <span className="mt-1 flex h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {g.categoryPath ?? g.categoryName ?? g.categoryId}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {g.impactedTickets} ticket(s) · erreurs{" "}
                      {Math.round((g.disagreementRate ?? 0) * 100)}%
                      {(g.kbCoverage ?? 0) < 0.3 && (
                        <span className="ml-1 text-rose-500">· aucun article proche</span>
                      )}
                    </div>
                  </div>
                  <span className="ml-1 text-[10px] font-medium tabular-nums text-indigo-600 dark:text-indigo-400">
                    {Math.round(g.priority ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Opportunités de maintenance"
          icon={<Wrench className="h-4 w-4 text-purple-500" />}
          hint="Suggestions préventives : patterns récurrents, actifs vieillissants, hotspots."
          href="/intelligence/maintenance"
        >
          {data.maintenanceSuggestions.length === 0 ? (
            <Empty>Pas de suggestion active.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.maintenanceSuggestions.slice(0, 6).map((s, i) => (
                <li key={s.suggestionId ?? i} className="flex items-start gap-2">
                  <ImpactBadge impact={s.clientImpact} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {s.title ?? "Sans titre"}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {s.rationale ?? ""}
                    </div>
                  </div>
                  {s.estimatedEffort && (
                    <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {s.estimatedEffort}
                    </span>
                  )}
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
  extraHref,
  extraLabel,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  href?: string;
  /** Lien secondaire optionnel à droite du header (ex: "Articles proposés"). */
  extraHref?: string;
  extraLabel?: string;
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
        {extraHref && extraLabel && (
          <Link
            href={extraHref}
            className="ml-2 text-[11px] font-medium text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300"
          >
            {extraLabel}
          </Link>
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

function MetaCount({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1",
        highlight
          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
          : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
      )}
    >
      <div className="text-[10px] uppercase leading-none tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function AgreementBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const color =
    pct >= 0.8
      ? "bg-emerald-500"
      : pct >= 0.6
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={cn("h-full", color)} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="w-7 text-right text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

function TrendBadge({ delta }: { delta: number }) {
  if (delta > 0)
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="h-3 w-3" />
        {(delta * 100).toFixed(0)}
      </span>
    );
  if (delta < 0)
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
        <TrendingDown className="h-3 w-3" />
        {(delta * 100).toFixed(0)}
      </span>
    );
  return null;
}

function ScoreRing({ value }: { value: number }) {
  const color =
    value >= 80
      ? "text-emerald-500"
      : value >= 60
        ? "text-amber-500"
        : "text-rose-500";
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums",
        color,
        value >= 80
          ? "border-emerald-500"
          : value >= 60
            ? "border-amber-500"
            : "border-rose-500",
      )}
    >
      {value}
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

function ImpactBadge({ impact }: { impact?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    high: {
      label: "Fort",
      cls: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    },
    medium: {
      label: "Moyen",
      cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    },
    low: {
      label: "Faible",
      cls: "bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
    },
  };
  const info = map[impact ?? "medium"] ?? map.medium;
  return (
    <span
      className={cn(
        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
        info.cls,
      )}
    >
      {info.label}
    </span>
  );
}
