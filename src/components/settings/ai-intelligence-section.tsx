"use client";

// ============================================================================
// Settings > Intelligence IA — dashboard admin.
//
// Visibilité sur l'usage IA dans Nexus :
//   - volume total + coût total
//   - répartition par feature (triage, response_assist, etc.)
//   - répartition par provider (OpenAI vs Ollama vs autres)
//   - taux d'acceptation (accept+edit / total decisions)
//   - latence moyenne par feature
//   - sparkline volume + coût par jour
//   - 20 dernières invocations
//
// Rôle SUPERVISOR+ pour les coûts (données sensibles).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { AiBulkOpsSection } from "./ai-bulk-ops-section";
import { AiPendingFactsSection } from "./ai-pending-facts-section";
import {
  Sparkles,
  Cpu,
  Cloud,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Loader2,
  Activity,
  Brain,
  ShieldCheck,
  AlertTriangle,
  ThumbsUp,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FeatureStats {
  feature: string;
  count: number;
  costCents: number;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  acceptanceRate: number | null;
  decisions: number;
  driftDeltaPct: number | null;
  providerMix: Record<string, number>;
}

interface RecentInvocation {
  id: string;
  feature: string;
  provider: string;
  modelName: string;
  costCents: number | null;
  latencyMs: number | null;
  status: string;
  humanAction: string | null;
  sensitivityLevel: string;
  scrubApplied: boolean;
  blockedReason: string | null;
  createdAt: string;
}

interface ProviderHealth {
  kind: "openai" | "anthropic" | "ollama" | "local";
  available: boolean;
  defaultModel: string | null;
  latencyMs: number;
  error?: string;
}

interface HealthPayload {
  providers: ProviderHealth[];
  config: {
    ollamaUrl: string;
    openaiModel: string;
    anthropicModel?: string;
    ollamaModel: string;
    anyAvailable: boolean;
    allAvailable: boolean;
  };
  checkedAt: string;
}

interface DriftAlert {
  feature: string;
  deltaPct: number;
  direction: "declining" | "improving";
}

interface VersionStats {
  feature: string;
  version: string;
  count: number;
  accepts: number;
  decisions: number;
  costCents: number;
  failures: number;
  acceptanceRate: number | null;
  failureRate: number;
}

interface Stats {
  periodDays: number;
  totals: {
    invocations: number;
    costCents: number;
    failedRate: number;
    acceptanceRate: number | null;
    acceptedCount: number;
    editedCount: number;
    rejectedCount: number;
    decisionsTaken: number;
    scrubComplianceRate: number | null;
    sensitiveCalls: number;
  };
  byFeature: FeatureStats[];
  byProvider: Record<string, { count: number; costCents: number }>;
  byStatus: Record<string, number>;
  byDay: Array<{ day: string; count: number; costCents: number }>;
  byVersion: VersionStats[];
  drift: DriftAlert[];
  feedback: { categoryDisagreements: number; similarClicks: number };
  pendingFactsCount: number;
  recent: RecentInvocation[];
}

const FEATURE_LABEL: Record<string, string> = {
  triage: "Triage",
  response_assist: "Assistant de réponse",
  resolution_notes: "Notes de résolution",
  kb_gen: "Génération KB",
  close_audit: "Audit fermeture",
  checklist_gen: "Génération checklists",
  category_suggest: "Suggestion catégorie",
  priority_suggest: "Suggestion priorité",
  category_audit: "Audit taxonomie",
  meeting_suggest_tickets: "Extraction actions rencontre",
  asset_eol: "Recherche EOL équipement",
  copilot_chat: "Chat copilote",
  legacy_chat: "Chat (legacy)",
  risk_analysis: "Analyse de risque",
  monthly_report: "Rapport mensuel",
  sales_suggest: "Opportunités commerciales",
  tech_coaching: "Coaching équipe",
  facts_extract: "Extraction de faits",
  forwarded_email_detect: "Détection courriels transférés",
  security_incident_triage: "Triage incident (sécurité)",
  security_incident_synthesis: "Synthèse incident (sécurité)",
};

export function AiIntelligenceSection() {
  const [days, setDays] = useState("30");
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Health check au mount + toutes les 60s — permet de voir rapidement si
  // Ollama est tombé ou vient d'être activé.
  useEffect(() => {
    const loadHealth = async () => {
      try {
        const res = await fetch("/api/v1/ai/health");
        if (res.ok) setHealth(await res.json());
      } catch {
        /* ignore */
      }
    };
    loadHealth();
    const id = setInterval(loadHealth, 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/ai/stats?days=${days}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Intelligence IA — vue d'ensemble
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Visibilité sur l'usage, les coûts et la qualité des features IA
            dans Nexus.
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 derniers jours</SelectItem>
            <SelectItem value="30">30 derniers jours</SelectItem>
            <SelectItem value="60">60 derniers jours</SelectItem>
            <SelectItem value="90">90 derniers jours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Providers health — bannière en tête du dashboard */}
      {health && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-3.5 w-3.5 text-slate-600" />
              <h3 className="text-[12.5px] font-semibold text-slate-700">
                Providers IA
              </h3>
              <span className="text-[10.5px] text-slate-400 ml-auto">
                {new Date(health.checkedAt).toLocaleTimeString("fr-CA", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {health.providers.map((p) => (
                <div
                  key={p.kind}
                  className={cn(
                    "rounded-md border px-3 py-2 flex items-center gap-2",
                    p.available
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-slate-200 bg-slate-50",
                  )}
                >
                  {p.kind === "ollama" || p.kind === "local" ? (
                    <Cpu
                      className={cn(
                        "h-4 w-4",
                        p.available ? "text-blue-600" : "text-slate-400",
                      )}
                    />
                  ) : (
                    <Cloud
                      className={cn(
                        "h-4 w-4",
                        p.available ? "text-emerald-600" : "text-slate-400",
                      )}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium capitalize text-slate-800">
                      {p.kind}
                    </p>
                    <p className="text-[10.5px] text-slate-500 truncate">
                      {p.defaultModel ?? "—"}
                    </p>
                  </div>
                  {p.available ? (
                    <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Dispo · {p.latencyMs}ms
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-slate-500">
                      <XCircle className="h-3 w-3" />
                      Indispo
                    </span>
                  )}
                </div>
              ))}
            </div>
            {!health.config.anyAvailable && (
              <p className="mt-2 text-[11px] text-red-700">
                ⚠ Aucun provider disponible — les features IA sont bloquées.
              </p>
            )}
            {health.config.anyAvailable &&
              !health.providers.find((p) => p.kind === "ollama")?.available && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Ollama local n'est pas détecté. Voir{" "}
                  <code className="bg-slate-100 px-1 rounded">
                    docs/ai-ollama-install.md
                  </code>{" "}
                  pour l'installer et économiser les coûts OpenAI sur les tâches
                  simples.
                </p>
              )}
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading && !stats && (
        <div className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      )}

      {stats && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <StatCard
              icon={<Sparkles className="h-4 w-4 text-violet-600" />}
              label="Invocations"
              value={stats.totals.invocations.toLocaleString("fr-CA")}
              hint={`${stats.periodDays} jours`}
            />
            <StatCard
              icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
              label="Coût estimé"
              value={`${(stats.totals.costCents / 100).toFixed(2)} $`}
              hint="cloud (Ollama = 0 $)"
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
              label="Taux d'acceptation"
              value={
                stats.totals.acceptanceRate != null
                  ? `${Math.round(stats.totals.acceptanceRate * 100)}%`
                  : "—"
              }
              hint={
                stats.totals.decisionsTaken > 0
                  ? `${stats.totals.decisionsTaken} décisions`
                  : "aucune décision loguée"
              }
            />
            <StatCard
              icon={<XCircle className="h-4 w-4 text-red-600" />}
              label="Taux d'échec"
              value={`${(stats.totals.failedRate * 100).toFixed(1)}%`}
              hint="timeout / erreur / bloqué"
            />
            <StatCard
              icon={
                <ShieldCheck
                  className={cn(
                    "h-4 w-4",
                    stats.totals.scrubComplianceRate == null
                      ? "text-slate-400"
                      : stats.totals.scrubComplianceRate >= 0.99
                        ? "text-emerald-600"
                        : "text-amber-600",
                  )}
                />
              }
              label="Conformité scrub"
              value={
                stats.totals.scrubComplianceRate != null
                  ? `${Math.round(stats.totals.scrubComplianceRate * 100)}%`
                  : "—"
              }
              hint={
                stats.totals.sensitiveCalls > 0
                  ? `${stats.totals.sensitiveCalls} appels sensibles`
                  : "aucun appel sensible"
              }
            />
            <StatCard
              icon={
                <Brain
                  className={cn(
                    "h-4 w-4",
                    stats.pendingFactsCount > 0
                      ? "text-indigo-600"
                      : "text-slate-400",
                  )}
                />
              }
              label="Faits en attente"
              value={stats.pendingFactsCount.toLocaleString("fr-CA")}
              hint={
                stats.pendingFactsCount > 0
                  ? "à valider ci-dessous"
                  : "aucun en attente"
              }
            />
          </div>

          {/* Drift alerts — dégradations ou améliorations > 15pp sur 7j vs 8-30j */}
          {stats.drift.length > 0 && (
            <Card className={cn(
              "border-l-4",
              stats.drift.some((d) => d.direction === "declining")
                ? "border-l-amber-400"
                : "border-l-emerald-400",
            )}>
              <CardContent className="p-4">
                <h3 className="text-[13px] font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Dérive détectée — acceptation 7j vs 8-30j
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {stats.drift.map((d) => (
                    <div
                      key={d.feature}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2",
                        d.direction === "declining"
                          ? "border-amber-200 bg-amber-50/40"
                          : "border-emerald-200 bg-emerald-50/40",
                      )}
                    >
                      {d.direction === "declining" ? (
                        <TrendingDown className="h-4 w-4 text-amber-600" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-slate-800 truncate">
                          {FEATURE_LABEL[d.feature] ?? d.feature}
                        </p>
                        <p className="text-[10.5px] text-slate-500">
                          {d.direction === "declining" ? "dégradation" : "amélioration"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-[13px] font-bold tabular-nums",
                          d.direction === "declining"
                            ? "text-amber-700"
                            : "text-emerald-700",
                        )}
                      >
                        {d.deltaPct > 0 ? "+" : ""}
                        {d.deltaPct}pp
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Feedback explicite */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <ThumbsUp className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                    Désaccords catégorie
                  </p>
                  <p className="text-[16px] font-bold text-slate-900 tabular-nums">
                    {stats.feedback.categoryDisagreements.toLocaleString("fr-CA")}
                  </p>
                  <p className="text-[10.5px] text-slate-400">
                    feedback sur suggestion de catégorie
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <Activity className="h-4 w-4 text-violet-600" />
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                    Clics tickets similaires
                  </p>
                  <p className="text-[16px] font-bold text-slate-900 tabular-nums">
                    {stats.feedback.similarClicks.toLocaleString("fr-CA")}
                  </p>
                  <p className="text-[10.5px] text-slate-400">
                    feedback implicite CTR
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Par feature */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-[13px] font-semibold text-slate-700 mb-3">
                Usage par feature
              </h3>
              {stats.byFeature.length === 0 ? (
                <p className="text-[12.5px] text-slate-500 italic">
                  Aucune invocation sur cette période.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th className="py-2 px-2 font-semibold">Feature</th>
                        <th className="py-2 px-2 font-semibold text-right">Calls</th>
                        <th className="hidden sm:table-cell py-2 px-2 font-semibold text-right">Coût</th>
                        <th className="hidden md:table-cell py-2 px-2 font-semibold text-right">P50</th>
                        <th className="hidden lg:table-cell py-2 px-2 font-semibold text-right">P95</th>
                        <th className="hidden sm:table-cell py-2 px-2 font-semibold text-right">Acceptation</th>
                        <th className="hidden md:table-cell py-2 px-2 font-semibold text-right">Dérive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.byFeature.map((f) => (
                        <tr key={f.feature} className="hover:bg-slate-50/50">
                          <td className="py-2 px-2">
                            <span className="font-medium text-slate-800">
                              {FEATURE_LABEL[f.feature] ?? f.feature}
                            </span>
                            <span className="ml-2 text-[10.5px] text-slate-400 font-mono">
                              {f.feature}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {f.count.toLocaleString("fr-CA")}
                          </td>
                          <td className="hidden sm:table-cell py-2 px-2 text-right tabular-nums">
                            {f.costCents > 0 ? `${(f.costCents / 100).toFixed(2)} $` : "—"}
                          </td>
                          <td className="hidden md:table-cell py-2 px-2 text-right tabular-nums text-slate-600">
                            {f.p50LatencyMs != null ? `${f.p50LatencyMs} ms` : "—"}
                          </td>
                          <td className="hidden lg:table-cell py-2 px-2 text-right tabular-nums text-slate-500">
                            {f.p95LatencyMs != null ? `${f.p95LatencyMs} ms` : "—"}
                          </td>
                          <td className="hidden sm:table-cell py-2 px-2 text-right">
                            {f.acceptanceRate != null ? (
                              <span
                                className={cn(
                                  "tabular-nums font-medium",
                                  f.acceptanceRate >= 0.7
                                    ? "text-emerald-700"
                                    : f.acceptanceRate >= 0.4
                                      ? "text-amber-700"
                                      : "text-red-700",
                                )}
                                title={`${f.decisions} décisions`}
                              >
                                {Math.round(f.acceptanceRate * 100)}%
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="hidden md:table-cell py-2 px-2 text-right">
                            {f.driftDeltaPct != null ? (
                              <span
                                className={cn(
                                  "tabular-nums font-medium inline-flex items-center gap-0.5",
                                  f.driftDeltaPct < -5
                                    ? "text-amber-700"
                                    : f.driftDeltaPct > 5
                                      ? "text-emerald-700"
                                      : "text-slate-500",
                                )}
                                title="Acceptation 7j vs 8-30j (pp)"
                              >
                                {f.driftDeltaPct > 0 ? "+" : ""}
                                {f.driftDeltaPct}pp
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Providers + Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-[13px] font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <Cloud className="h-3.5 w-3.5" />
                  Par provider
                </h3>
                <div className="space-y-1.5">
                  {Object.entries(stats.byProvider).map(([prov, info]) => (
                    <ProviderBar
                      key={prov}
                      name={prov}
                      count={info.count}
                      costCents={info.costCents}
                      total={stats.totals.invocations}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="text-[13px] font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Par statut
                </h3>
                <div className="space-y-1.5">
                  {Object.entries(stats.byStatus).map(([status, count]) => {
                    const color =
                      status === "ok"
                        ? "bg-emerald-500"
                        : status === "blocked"
                          ? "bg-slate-500"
                          : "bg-red-500";
                    return (
                      <StatusBar
                        key={status}
                        name={status}
                        count={count}
                        total={stats.totals.invocations}
                        color={color}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Versions de prompt — détection régression post-refactor */}
          {stats.byVersion.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-[13px] font-semibold text-slate-700 mb-3">
                  Versions de prompts actives
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 px-2 font-semibold">Feature</th>
                        <th className="py-1.5 px-2 font-semibold">Version</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Calls</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Acceptation</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Échec</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.byVersion.map((v) => (
                        <tr
                          key={`${v.feature}-${v.version}`}
                          className="hover:bg-slate-50/50"
                        >
                          <td className="py-1.5 px-2 text-slate-700">
                            {FEATURE_LABEL[v.feature] ?? v.feature}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-[11px] text-slate-600">
                            {v.version}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums">
                            {v.count.toLocaleString("fr-CA")}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {v.acceptanceRate != null ? (
                              <span
                                className={cn(
                                  "tabular-nums font-medium",
                                  v.acceptanceRate >= 0.7
                                    ? "text-emerald-700"
                                    : v.acceptanceRate >= 0.4
                                      ? "text-amber-700"
                                      : "text-red-700",
                                )}
                              >
                                {Math.round(v.acceptanceRate * 100)}%
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <span
                              className={cn(
                                "tabular-nums",
                                v.failureRate > 0.1
                                  ? "text-red-700 font-medium"
                                  : "text-slate-500",
                              )}
                            >
                              {(v.failureRate * 100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sparkline volume par jour */}
          {stats.byDay.length > 1 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-[13px] font-semibold text-slate-700 mb-3">
                  Volume par jour
                </h3>
                <VolumeSpark data={stats.byDay} />
              </CardContent>
            </Card>
          )}

          {/* Bulk ops — retro-application du triage sur tickets historiques */}
          <AiBulkOpsSection />

          {/* Revue centralisée des faits proposés par l'IA, toutes orgs */}
          <AiPendingFactsSection />

          {/* Recent */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-[13px] font-semibold text-slate-700 mb-3">
                20 dernières invocations
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 px-2 font-semibold">Feature</th>
                      <th className="hidden sm:table-cell py-1.5 px-2 font-semibold">Provider</th>
                      <th className="hidden lg:table-cell py-1.5 px-2 font-semibold">Sens.</th>
                      <th className="hidden lg:table-cell py-1.5 px-2 font-semibold">Scrub</th>
                      <th className="py-1.5 px-2 font-semibold">Statut</th>
                      <th className="hidden md:table-cell py-1.5 px-2 font-semibold">Action</th>
                      <th className="hidden md:table-cell py-1.5 px-2 font-semibold text-right">Coût</th>
                      <th className="hidden lg:table-cell py-1.5 px-2 font-semibold text-right">Latence</th>
                      <th className="hidden sm:table-cell py-1.5 px-2 font-semibold">Quand</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.recent.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50">
                        <td className="py-1.5 px-2">
                          <span className="text-slate-800">
                            {FEATURE_LABEL[r.feature] ?? r.feature}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell py-1.5 px-2 text-slate-600">
                          {r.provider}
                          <span className="text-slate-400 text-[10px] ml-1">
                            {r.modelName}
                          </span>
                        </td>
                        <td className="hidden lg:table-cell py-1.5 px-2">
                          <SensitivityBadge level={r.sensitivityLevel} />
                        </td>
                        <td className="hidden lg:table-cell py-1.5 px-2">
                          {r.scrubApplied ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="hidden md:table-cell py-1.5 px-2">
                          <ActionBadge action={r.humanAction} />
                        </td>
                        <td className="hidden md:table-cell py-1.5 px-2 text-right tabular-nums text-slate-600">
                          {r.costCents != null && r.costCents > 0
                            ? `${(r.costCents / 100).toFixed(3)} $`
                            : "—"}
                        </td>
                        <td className="hidden lg:table-cell py-1.5 px-2 text-right tabular-nums text-slate-600">
                          {r.latencyMs != null ? `${r.latencyMs} ms` : "—"}
                        </td>
                        <td className="hidden sm:table-cell py-1.5 px-2 text-slate-500 whitespace-nowrap">
                          <Clock className="h-2.5 w-2.5 inline mr-0.5 text-slate-400" />
                          {new Date(r.createdAt).toLocaleString("fr-CA", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
          {icon}
          {label}
        </div>
        <p className="text-[20px] font-bold text-slate-900 tabular-nums">
          {value}
        </p>
        {hint && <p className="text-[10.5px] text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ProviderBar({
  name,
  count,
  costCents,
  total,
}: {
  name: string;
  count: number;
  costCents: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const isLocal = name === "ollama" || name === "local";
  const color = isLocal
    ? "bg-blue-500"
    : name === "anthropic"
      ? "bg-violet-500"
      : name === "openai"
        ? "bg-emerald-500"
        : name === "cache"
          ? "bg-slate-400"
          : "bg-slate-500";
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px] mb-0.5">
        <span className="flex items-center gap-1">
          {isLocal ? (
            <Cpu className="h-3 w-3 text-blue-600" />
          ) : (
            <Cloud
              className={cn(
                "h-3 w-3",
                name === "anthropic"
                  ? "text-violet-600"
                  : name === "openai"
                    ? "text-emerald-600"
                    : "text-slate-500",
              )}
            />
          )}
          <span className="font-medium text-slate-800 capitalize">{name}</span>
        </span>
        <span className="tabular-nums text-slate-600 flex items-center gap-2">
          <span>
            {count} ({pct.toFixed(0)}%)
          </span>
          {costCents > 0 && (
            <span className="text-[10.5px] text-slate-500">
              {(costCents / 100).toFixed(2)} $
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusBar({
  name,
  count,
  total,
  color,
}: {
  name: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px] mb-0.5">
        <span className="font-medium text-slate-800 capitalize">{name}</span>
        <span className="tabular-nums text-slate-600">
          {count} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function VolumeSpark({
  data,
}: {
  data: Array<{ day: string; count: number; costCents: number }>;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-0.5 h-20">
      {data.map((d) => {
        const h = (d.count / max) * 100;
        return (
          <div
            key={d.day}
            className="flex-1 min-w-[4px] bg-violet-200 hover:bg-violet-400 transition-colors rounded-t"
            style={{ height: `${h}%` }}
            title={`${d.day} — ${d.count} invocations, ${(d.costCents / 100).toFixed(2)} $`}
          />
        );
      })}
    </div>
  );
}

function SensitivityBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    public: { bg: "bg-slate-100", text: "text-slate-700", label: "public" },
    internal: { bg: "bg-blue-100", text: "text-blue-700", label: "interne" },
    client_data: {
      bg: "bg-amber-100",
      text: "text-amber-700",
      label: "client",
    },
    regulated: { bg: "bg-red-100", text: "text-red-700", label: "réglementé" },
  };
  const s = map[level] ?? {
    bg: "bg-slate-100",
    text: "text-slate-700",
    label: level,
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        s.bg,
        s.text,
      )}
    >
      {s.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
        <CheckCircle2 className="h-2.5 w-2.5" />
        ok
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-red-700">
      <XCircle className="h-2.5 w-2.5" />
      {status}
    </span>
  );
}

function ActionBadge({ action }: { action: string | null }) {
  if (!action) return <span className="text-slate-400 text-[11px]">—</span>;
  const map: Record<string, { bg: string; text: string; label: string }> = {
    accepted: {
      bg: "bg-emerald-100",
      text: "text-emerald-700",
      label: "accepté",
    },
    edited: { bg: "bg-blue-100", text: "text-blue-700", label: "édité" },
    rejected: { bg: "bg-red-100", text: "text-red-700", label: "rejeté" },
  };
  const s = map[action] ?? {
    bg: "bg-slate-100",
    text: "text-slate-700",
    label: action,
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        s.bg,
        s.text,
      )}
    >
      {s.label}
    </span>
  );
}
