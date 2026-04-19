"use client";

// ============================================================================
// Widget Activité IA — tuile du tableau de bord.
//
// Montre en un coup d'œil :
//   - nombre d'invocations IA sur 30 jours
//   - taux d'acceptation (accept+edit / decisions)
//   - économie Ollama vs OpenAI (invocations locales ✕ coût évité moyen)
//   - top 3 features par volume
//   - health des providers (point vert/rouge)
//
// Lien « Voir les détails » → /settings?section=ai_intelligence pour
// aller voir le dashboard complet.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Loader2,
  ArrowRight,
  Cpu,
  Cloud,
  CheckCircle2,
  XCircle,
  DollarSign,
  Brain,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Stats {
  totals: {
    invocations: number;
    costCents: number;
    acceptanceRate: number | null;
    decisionsTaken: number;
  };
  byFeature: Array<{ feature: string; count: number; costCents: number }>;
  byProvider: Record<string, number>;
  pendingFactsCount?: number;
}

interface ProviderHealth {
  kind: string;
  available: boolean;
  defaultModel: string | null;
}

const FEATURE_LABEL: Record<string, string> = {
  triage: "Triage",
  response_assist: "Assistant réponse",
  resolution_notes: "Notes résolution",
  kb_gen: "KB auto",
  close_audit: "Audit fermeture",
  checklist_gen: "Checklists",
  category_suggest: "Catégorisation",
  priority_suggest: "Priorisation",
  copilot_chat: "Chat copilote",
  risk_analysis: "Analyse de risque",
  monthly_report: "Rapport mensuel",
  sales_suggest: "Opportunités",
  tech_coaching: "Coaching",
  facts_extract: "Extraction de faits",
  forwarded_email_detect: "Forward detect",
  escalation_brief: "Brief escalade",
  tone_rewrite: "Ton",
  legacy_chat: "Chat",
  asset_eol: "EOL",
  category_audit: "Audit catégories",
  meeting_suggest_tickets: "Actions rencontre",
};

export function AiActivityWidget() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<ProviderHealth[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, healthRes] = await Promise.all([
        fetch("/api/v1/ai/stats?days=30"),
        fetch("/api/v1/ai/health"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      else if (statsRes.status === 403) {
        // Pas assez de droits pour voir les coûts — c'est OK, on affiche
        // quand même un message minimal.
        setError("forbidden");
      } else throw new Error(`HTTP ${statsRes.status}`);
      if (healthRes.ok) {
        const data = await healthRes.json();
        setHealth(data.providers ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="text-[13px] font-semibold text-slate-900">
              Activité IA
            </h3>
          </div>
          <Link
            href="/settings?section=ai_intelligence"
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900"
          >
            Détails
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}

        {!loading && error === "forbidden" && (
          <p className="text-[11.5px] text-slate-500 italic">
            Accès aux statistiques IA réservé aux superviseurs.
          </p>
        )}

        {!loading && error && error !== "forbidden" && (
          <p className="text-[11.5px] text-red-600">{error}</p>
        )}

        {!loading && stats && (
          <div className="flex-1 flex flex-col gap-3">
            {/* Providers status */}
            {health && health.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-[10.5px]">
                {health.map((p) => (
                  <span
                    key={p.kind}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
                      p.available
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500",
                    )}
                    title={p.defaultModel ?? ""}
                  >
                    {p.kind === "ollama" || p.kind === "local" ? (
                      <Cpu className="h-2.5 w-2.5" />
                    ) : (
                      <Cloud className="h-2.5 w-2.5" />
                    )}
                    {p.kind}
                    {p.available ? (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    ) : (
                      <XCircle className="h-2.5 w-2.5" />
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Top KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <MiniKpi
                label="Appels"
                value={stats.totals.invocations.toLocaleString("fr-CA")}
                hint="30 jours"
              />
              <MiniKpi
                label="Acceptation"
                value={
                  stats.totals.acceptanceRate != null
                    ? `${Math.round(stats.totals.acceptanceRate * 100)}%`
                    : "—"
                }
                hint={
                  stats.totals.decisionsTaken > 0
                    ? `${stats.totals.decisionsTaken} décisions`
                    : "pas de décision"
                }
              />
              <MiniKpi
                label="Coût"
                value={`${(stats.totals.costCents / 100).toFixed(2)} $`}
                hint="OpenAI"
                icon={<DollarSign className="h-2.5 w-2.5" />}
              />
            </div>

            {/* Top features */}
            {stats.byFeature.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Top features
                </p>
                <ul className="space-y-0.5">
                  {stats.byFeature.slice(0, 3).map((f) => (
                    <li
                      key={f.feature}
                      className="flex items-center justify-between text-[11.5px] text-slate-700"
                    >
                      <span className="truncate">
                        {FEATURE_LABEL[f.feature] ?? f.feature}
                      </span>
                      <span className="tabular-nums text-slate-500">
                        {f.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-auto space-y-1.5">
              {/* Nudge : faits en attente de validation (à travers toutes les orgs) */}
              {stats.pendingFactsCount && stats.pendingFactsCount > 0 ? (
                <Link
                  href="/settings?section=ai_intelligence"
                  className="block text-[10.5px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-100"
                >
                  <Brain className="h-2.5 w-2.5 inline mr-0.5" />
                  {stats.pendingFactsCount} fait(s) IA à valider →
                </Link>
              ) : null}

              {/* Économie Ollama */}
              {stats.byProvider.ollama > 0 && (
                <p className="text-[10.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                  <Cpu className="h-2.5 w-2.5 inline mr-0.5" />
                  {stats.byProvider.ollama} appel(s) routés localement (Ollama) —
                  {" "}économie estimée
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniKpi({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-1.5">
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-0.5">
        {icon}
        {label}
      </p>
      <p className="text-[15px] font-bold text-slate-900 tabular-nums leading-tight">
        {value}
      </p>
      {hint && <p className="text-[9.5px] text-slate-400">{hint}</p>}
    </div>
  );
}
