"use client";

// ============================================================================
// AI Incident Panel — bloc d'analyse IA sur la fiche incident.
//
// Deux actions :
//   1. Triager → classification MITRE + sévérité + FP probability + actions
//   2. Synthétiser → narratif + timeline + hypothèses + recommandations
//
// Les résultats sont persistés dans incident.metadata.{aiTriage,aiSynthesis}
// côté API. L'UI peut les afficher sans rejouer l'appel IA à chaque ouverture
// de page. La regénération est explicite (bouton "Regénérer").
// ============================================================================

import { useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  Brain,
  Target,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ListChecks,
  Clock,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TriageResult {
  mitreTactic: string | null;
  mitreTactics: string[];
  mitreTechnique: string | null;
  mitreTechniques: string[];
  suggestedSeverity: "critical" | "high" | "warning" | "info" | null;
  falsePositiveProbability: number;
  urgency: "immediate" | "high" | "normal" | "low";
  actionCategory: "investigate" | "remediate" | "tune_rule" | "dismiss";
  confidence: number;
  reasoning: string;
  recommendedActions: Array<{
    order: number;
    action: string;
    command?: string;
    rationale?: string;
  }>;
  invocationId?: string;
  generatedAt?: string;
}

interface SynthesisResult {
  executiveSummary: string;
  technicalNarrative: string;
  timeline: Array<{ at: string; event: string; actor?: string }>;
  hypotheses: Array<{
    summary: string;
    likelihood: "high" | "medium" | "low";
    supportingEvidence: string;
  }>;
  impactAssessment: {
    scope: string;
    severity: "critical" | "high" | "moderate" | "low" | "none";
    affectedAssets: string[];
  };
  immediateNextSteps: string[];
  longTermRecommendations: string[];
  invocationId?: string;
  generatedAt?: string;
}

const URGENCY_CLASS: Record<TriageResult["urgency"], string> = {
  immediate: "bg-red-100 text-red-800 ring-red-200",
  high: "bg-orange-100 text-orange-800 ring-orange-200",
  normal: "bg-blue-100 text-blue-800 ring-blue-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};
const ACTION_LABEL: Record<TriageResult["actionCategory"], string> = {
  investigate: "Investiguer",
  remediate: "Remédier",
  tune_rule: "Ajuster la règle",
  dismiss: "Classer (faux positif)",
};
const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 ring-red-200",
  high: "bg-orange-100 text-orange-800 ring-orange-200",
  warning: "bg-amber-100 text-amber-800 ring-amber-200",
  info: "bg-slate-100 text-slate-600 ring-slate-200",
  moderate: "bg-amber-100 text-amber-800 ring-amber-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  none: "bg-slate-100 text-slate-500 ring-slate-200",
};
const LIKELIHOOD_LABEL: Record<string, string> = {
  high: "élevée",
  medium: "modérée",
  low: "faible",
};

export interface AiIncidentPanelProps {
  incidentId: string;
  initialTriage?: TriageResult | null;
  initialSynthesis?: SynthesisResult | null;
}

export function AiIncidentPanel({
  incidentId,
  initialTriage = null,
  initialSynthesis = null,
}: AiIncidentPanelProps) {
  const [triage, setTriage] = useState<TriageResult | null>(initialTriage);
  const [synthesis, setSynthesis] = useState<SynthesisResult | null>(
    initialSynthesis,
  );
  const [loadingTriage, setLoadingTriage] = useState(false);
  const [loadingSynth, setLoadingSynth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTriage(initialTriage);
    setSynthesis(initialSynthesis);
  }, [initialTriage, initialSynthesis]);

  async function runTriage() {
    setLoadingTriage(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/security-center/incidents/${incidentId}/ai-triage`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTriage({ ...data.triage, generatedAt: data.generatedAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoadingTriage(false);
    }
  }

  async function runSynthesis() {
    setLoadingSynth(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/security-center/incidents/${incidentId}/ai-synthesis`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSynthesis({ ...data.synthesis, generatedAt: data.generatedAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoadingSynth(false);
    }
  }

  async function sendFeedback(
    invocationId: string | undefined,
    action: "accepted" | "rejected",
  ) {
    if (!invocationId) return;
    try {
      await fetch(`/api/v1/ai/invocations/${invocationId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      // silencieux — feedback best-effort
    }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-500" />
          <h2 className="text-[13px] font-semibold text-slate-800">
            Analyse IA de l&apos;incident
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runTriage}
            disabled={loadingTriage}
            className="gap-1.5"
          >
            {loadingTriage ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Target className="h-3 w-3 text-indigo-600" />
            )}
            {triage ? "Retriager" : "Triager"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={runSynthesis}
            disabled={loadingSynth}
            className="gap-1.5"
          >
            {loadingSynth ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 text-violet-600" />
            )}
            {synthesis ? "Regénérer synthèse" : "Synthétiser"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700">
          {error}
        </div>
      )}

      {!triage && !synthesis && !loadingTriage && !loadingSynth && (
        <p className="text-[12.5px] text-slate-500 italic">
          Lance le triage pour obtenir une classification MITRE + sévérité + FP
          probability, ou la synthèse pour un rapport narratif complet.
        </p>
      )}

      {triage && <TriageCard triage={triage} onFeedback={sendFeedback} />}
      {synthesis && (
        <SynthesisCard synthesis={synthesis} onFeedback={sendFeedback} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Triage card
// ----------------------------------------------------------------------------
function TriageCard({
  triage,
  onFeedback,
}: {
  triage: TriageResult;
  onFeedback: (
    id: string | undefined,
    action: "accepted" | "rejected",
  ) => void;
}) {
  return (
    <div className="rounded-md border border-indigo-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-indigo-600">
          <Target className="h-3 w-3" />
          Triage
          {triage.generatedAt && (
            <span className="text-slate-400 normal-case font-normal ml-1">
              · {new Date(triage.generatedAt).toLocaleString("fr-CA")}
            </span>
          )}
        </div>
        <FeedbackButtons
          invocationId={triage.invocationId}
          onFeedback={onFeedback}
        />
      </div>

      {/* Badges clés */}
      <div className="flex flex-wrap items-center gap-1.5">
        {triage.suggestedSeverity && (
          <Badge
            className={cn(
              "ring-1 ring-inset",
              SEVERITY_CLASS[triage.suggestedSeverity] ?? "bg-slate-100",
            )}
          >
            sev: {triage.suggestedSeverity}
          </Badge>
        )}
        <Badge
          className={cn("ring-1 ring-inset", URGENCY_CLASS[triage.urgency])}
        >
          urgence: {triage.urgency}
        </Badge>
        <Badge className="bg-violet-100 text-violet-800 ring-violet-200 ring-1 ring-inset">
          {ACTION_LABEL[triage.actionCategory]}
        </Badge>
        {triage.falsePositiveProbability >= 0.3 && (
          <Badge
            className={cn(
              "ring-1 ring-inset",
              triage.falsePositiveProbability >= 0.7
                ? "bg-amber-100 text-amber-800 ring-amber-200"
                : "bg-amber-50 text-amber-700 ring-amber-100",
            )}
          >
            FP {Math.round(triage.falsePositiveProbability * 100)}%
          </Badge>
        )}
        {triage.confidence > 0 && (
          <Badge className="bg-slate-100 text-slate-600 ring-slate-200 ring-1 ring-inset">
            conf {Math.round(triage.confidence * 100)}%
          </Badge>
        )}
      </div>

      {/* MITRE */}
      {(triage.mitreTactic || triage.mitreTactics.length > 0) && (
        <div className="flex items-start gap-2 text-[12px]">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
          <div className="flex flex-wrap gap-1">
            {[
              ...(triage.mitreTactic ? [triage.mitreTactic] : []),
              ...triage.mitreTactics.filter((t) => t !== triage.mitreTactic),
            ].map((t) => (
              <a
                key={`ta-${t}`}
                href={`https://attack.mitre.org/tactics/${t}/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono"
              >
                {t}
              </a>
            ))}
            {[
              ...(triage.mitreTechnique ? [triage.mitreTechnique] : []),
              ...triage.mitreTechniques.filter(
                (t) => t !== triage.mitreTechnique,
              ),
            ].map((t) => (
              <a
                key={`te-${t}`}
                href={`https://attack.mitre.org/techniques/${t.replace(/\./g, "/")}/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono"
              >
                {t}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Reasoning */}
      {triage.reasoning && (
        <p className="text-[12.5px] text-slate-700 italic leading-relaxed">
          {triage.reasoning}
        </p>
      )}

      {/* Actions recommandées */}
      {triage.recommendedActions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            <ListChecks className="h-3 w-3" />
            Actions recommandées
          </div>
          <ol className="space-y-1.5">
            {triage.recommendedActions.map((a) => (
              <li
                key={`${a.order}-${a.action}`}
                className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5"
              >
                <div className="flex items-start gap-2 text-[12px] text-slate-800">
                  <span className="font-semibold text-slate-500 shrink-0">
                    {a.order}.
                  </span>
                  <span className="flex-1">{a.action}</span>
                </div>
                {a.command && (
                  <pre className="mt-1 text-[11px] bg-slate-900 text-slate-100 rounded px-2 py-1 overflow-x-auto">
                    <code>{a.command}</code>
                  </pre>
                )}
                {a.rationale && (
                  <p className="mt-1 text-[11px] text-slate-500 italic">
                    {a.rationale}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Synthesis card
// ----------------------------------------------------------------------------
function SynthesisCard({
  synthesis,
  onFeedback,
}: {
  synthesis: SynthesisResult;
  onFeedback: (
    id: string | undefined,
    action: "accepted" | "rejected",
  ) => void;
}) {
  return (
    <div className="rounded-md border border-violet-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-violet-600">
          <Sparkles className="h-3 w-3" />
          Synthèse narrative
          {synthesis.generatedAt && (
            <span className="text-slate-400 normal-case font-normal ml-1">
              · {new Date(synthesis.generatedAt).toLocaleString("fr-CA")}
            </span>
          )}
        </div>
        <FeedbackButtons
          invocationId={synthesis.invocationId}
          onFeedback={onFeedback}
        />
      </div>

      {synthesis.executiveSummary && (
        <div className="rounded border border-violet-100 bg-violet-50/40 px-3 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-violet-700 mb-1">
            Résumé exécutif
          </p>
          <p className="text-[13px] text-slate-800 leading-relaxed">
            {synthesis.executiveSummary}
          </p>
        </div>
      )}

      {synthesis.technicalNarrative && (
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Narratif technique
          </p>
          <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap leading-relaxed">
            {synthesis.technicalNarrative}
          </p>
        </div>
      )}

      {synthesis.impactAssessment.scope && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <Badge
            className={cn(
              "ring-1 ring-inset",
              SEVERITY_CLASS[synthesis.impactAssessment.severity] ??
                "bg-slate-100",
            )}
          >
            Impact : {synthesis.impactAssessment.severity}
          </Badge>
          <span className="text-slate-700">
            {synthesis.impactAssessment.scope}
          </span>
          {synthesis.impactAssessment.affectedAssets.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {synthesis.impactAssessment.affectedAssets.map((a) => (
                <code
                  key={a}
                  className="text-[11px] bg-slate-100 rounded px-1.5 py-0.5 text-slate-700"
                >
                  {a}
                </code>
              ))}
            </div>
          )}
        </div>
      )}

      {synthesis.timeline.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            <Clock className="h-3 w-3" />
            Timeline reconstituée
          </div>
          <ol className="relative pl-4 border-l-2 border-violet-100 space-y-1.5">
            {synthesis.timeline.map((t, i) => (
              <li key={i} className="text-[12px] text-slate-700">
                <span className="font-mono text-[11px] text-slate-500 mr-1.5">
                  {t.at || "—"}
                </span>
                {t.event}
                {t.actor && (
                  <span className="text-slate-500 italic ml-1">
                    ({t.actor})
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {synthesis.hypotheses.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            <Lightbulb className="h-3 w-3" />
            Hypothèses de cause racine
          </div>
          <ul className="space-y-1.5">
            {synthesis.hypotheses.map((h, i) => (
              <li
                key={i}
                className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5"
              >
                <div className="flex items-start gap-2 text-[12px]">
                  <span
                    className={cn(
                      "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase shrink-0",
                      h.likelihood === "high"
                        ? "bg-red-100 text-red-800"
                        : h.likelihood === "medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {LIKELIHOOD_LABEL[h.likelihood]}
                  </span>
                  <span className="text-slate-800 flex-1">{h.summary}</span>
                </div>
                {h.supportingEvidence && (
                  <p className="mt-1 text-[11px] text-slate-500 italic">
                    {h.supportingEvidence}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {synthesis.immediateNextSteps.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Actions immédiates
          </div>
          <ul className="space-y-0.5 list-disc list-inside text-[12px] text-slate-700">
            {synthesis.immediateNextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {synthesis.longTermRecommendations.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            <Lightbulb className="h-3 w-3 text-indigo-600" />
            Recommandations long terme
          </div>
          <ul className="space-y-0.5 list-disc list-inside text-[12px] text-slate-700">
            {synthesis.longTermRecommendations.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers UI
// ----------------------------------------------------------------------------
function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

function FeedbackButtons({
  invocationId,
  onFeedback,
}: {
  invocationId?: string;
  onFeedback: (
    id: string | undefined,
    action: "accepted" | "rejected",
  ) => void;
}) {
  const [voted, setVoted] = useState<"accepted" | "rejected" | null>(null);
  if (!invocationId) return null;

  function vote(action: "accepted" | "rejected") {
    setVoted(action);
    onFeedback(invocationId, action);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => vote("accepted")}
        disabled={voted !== null}
        className={cn(
          "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] transition-colors",
          voted === "accepted"
            ? "bg-emerald-100 text-emerald-700"
            : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700",
          voted !== null && voted !== "accepted" && "opacity-40",
        )}
        title="Triage utile — valide l'analyse"
      >
        <ThumbsUp className="h-2.5 w-2.5" />
        utile
      </button>
      <button
        onClick={() => vote("rejected")}
        disabled={voted !== null}
        className={cn(
          "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] transition-colors",
          voted === "rejected"
            ? "bg-red-100 text-red-700"
            : "text-slate-500 hover:bg-red-50 hover:text-red-700",
          voted !== null && voted !== "rejected" && "opacity-40",
        )}
        title="Triage incorrect — alimente le feedback loop"
      >
        <ThumbsDown className="h-2.5 w-2.5" />
        pas utile
      </button>
    </div>
  );
}
