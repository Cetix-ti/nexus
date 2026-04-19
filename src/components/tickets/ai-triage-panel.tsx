"use client";

// ============================================================================
// AI Triage Panel — affiché sur la fiche ticket.
//
// Lit le DERNIER triage IA disponible via GET /api/v1/tickets/[id]/triage.
// Propose un résumé d'une ligne, et chaque suggestion (catégorie, priorité,
// type, doublon, incident majeur) avec boutons Accepter / Rejeter.
//
// Design copilote : rien n'est écrit sur le ticket sans clic explicite de
// l'agent. L'auto-application à la création (conservative, seuils élevés)
// se fait côté serveur via triageTicketAsync — ce panneau montre ce qui a
// été fait + ce qui reste proposé.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  X,
  Loader2,
  AlertTriangle,
  Link2,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TriageResult {
  summary: string;
  suggestedType?: "INCIDENT" | "SERVICE_REQUEST" | "PROBLEM" | "CHANGE";
  categoryId?: string | null;
  categoryConfidence?: number;
  priority?: "low" | "medium" | "high" | "critical";
  priorityConfidence?: "low" | "medium" | "high";
  priorityReasoning?: string;
  possibleDuplicateOfId?: string | null;
  possibleDuplicateReason?: string;
  majorIncidentHint?: {
    detected: boolean;
    reason?: string;
    relatedTicketIds: string[];
  };
}

interface TriagePayload {
  invocationId: string;
  provider: string;
  modelName: string;
  latencyMs: number;
  costCents: number | null;
  generatedAt: string;
  humanAction: string | null;
  result: TriageResult | null;
}

interface Props {
  ticketId: string;
  /** Catégorie courante du ticket — pour afficher "Suggérée" vs "Appliquée". */
  currentCategoryId?: string | null;
  /** Priorité courante + source — idem. */
  currentPriority?: string;
  currentPrioritySource?: string | null;
  /** Nom résolu de la catégorie suggérée (fourni par le parent). */
  suggestedCategoryLabel?: string | null;
  /** Appelé quand une suggestion est acceptée et qu'il faut refetch le ticket. */
  onTicketChanged?: () => void;
}

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critique",
  high: "Élevée",
  medium: "Moyenne",
  low: "Faible",
};
const TYPE_LABEL: Record<string, string> = {
  INCIDENT: "Incident",
  SERVICE_REQUEST: "Demande de service",
  PROBLEM: "Problème",
  CHANGE: "Changement",
};

export function AiTriagePanel({
  ticketId,
  currentCategoryId,
  currentPriority,
  currentPrioritySource,
  suggestedCategoryLabel,
  onTicketChanged,
}: Props) {
  const [payload, setPayload] = useState<TriagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Résolution de la catégorie suggérée — l'IA retourne un categoryId, on
  // charge l'arbre complet pour pouvoir afficher "Réseau › VPN › FortiClient"
  // au lieu du générique "Suggérée". Cache minimal (une seule fois, à
  // l'ouverture du panel).
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; parentId: string | null }>
  >([]);
  useEffect(() => {
    fetch("/api/v1/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setCategories(data);
      })
      .catch(() => {});
  }, []);

  function resolveCategoryPath(id: string): string | null {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const cat = byId.get(id);
    if (!cat) return null;
    const chain: string[] = [cat.name];
    let cursor = cat.parentId ? byId.get(cat.parentId) : undefined;
    while (cursor) {
      chain.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return chain.join(" › ");
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/triage`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPayload(data.triage ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runTriage() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/triage`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRunning(false);
    }
  }

  async function recordAction(
    action: "accepted" | "edited" | "rejected",
  ): Promise<void> {
    if (!payload) return;
    try {
      await fetch(`/api/v1/ai/invocations/${payload.invocationId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      // Non bloquant — on veut que l'action applicative réussisse quand
      // même si le log échoue.
    }
  }

  async function applyCategory() {
    if (!payload?.result?.categoryId) return;
    try {
      await fetch(`/api/v1/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: payload.result.categoryId }),
      });
      await recordAction("accepted");
      onTicketChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function applyPriority() {
    if (!payload?.result?.priority) return;
    try {
      await fetch(`/api/v1/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority: payload.result.priority.toUpperCase(),
          prioritySource: "MANUAL", // accepté humainement → on considère manual
        }),
      });
      await recordAction("accepted");
      onTicketChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function sendTriageFeedback(
    field: "priority" | "duplicate" | "type",
    value: string,
    verdict: "good" | "bad",
  ): Promise<void> {
    try {
      await fetch(`/api/v1/tickets/${ticketId}/triage-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value, verdict }),
      });
    } catch {
      /* silencieux — optimistic */
    }
  }

  async function applyType() {
    if (!payload?.result?.suggestedType) return;
    try {
      await fetch(`/api/v1/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: payload.result.suggestedType }),
      });
      await recordAction("accepted");
      onTicketChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[12px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Chargement du triage IA…
      </div>
    );
  }

  if (!payload || !payload.result) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            Triage IA
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={runTriage}
            disabled={running}
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {running ? "Analyse…" : "Générer"}
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Aucun triage IA pour ce ticket. Clique sur « Générer » pour une analyse
          complète (résumé, catégorie, priorité, type, doublons).
        </p>
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  const r = payload.result;
  const categoryAlreadyApplied =
    r.categoryId && r.categoryId === currentCategoryId;
  const priorityAlreadyApplied =
    r.priority && r.priority.toUpperCase() === currentPriority;

  return (
    <div className="rounded-lg border border-violet-200/70 bg-violet-50/40 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0 flex-1">
          <Sparkles className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-violet-900">Triage IA</p>
            <p
              className="text-[12.5px] text-slate-800 leading-snug mt-0.5"
              title={r.summary}
            >
              {r.summary}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {payload.provider} · {payload.modelName} ·{" "}
              {new Date(payload.generatedAt).toLocaleString("fr-CA", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "short",
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={runTriage}
          disabled={running}
          className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          title="Relancer le triage"
        >
          {running ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Catégorie — on résout le chemin complet (Niveau1 › Niveau2 › Niveau3)
          à partir du categoryId retourné par le triage. Fallback prop
          parent ou "Suggérée" générique si la catégorie n'est pas trouvée. */}
      {r.categoryId && (
        <SuggestionRow
          label="Catégorie"
          value={
            resolveCategoryPath(r.categoryId) ??
            suggestedCategoryLabel ??
            "Suggérée"
          }
          confidence={r.categoryConfidence}
          alreadyApplied={!!categoryAlreadyApplied}
          onAccept={applyCategory}
          onReject={() => recordAction("rejected")}
          onReview={async (verdict) => {
            if (!r.categoryId) return;
            try {
              await fetch(
                `/api/v1/tickets/${ticketId}/category-feedback`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    suggestedCategoryId: r.categoryId,
                    verdict,
                  }),
                },
              );
            } catch {
              /* silencieux — optimistic */
            }
          }}
        />
      )}

      {/* Priorité */}
      {r.priority && (
        <SuggestionRow
          label="Priorité"
          value={PRIORITY_LABEL[r.priority] ?? r.priority}
          confidenceLabel={
            r.priorityConfidence === "high"
              ? "Haute"
              : r.priorityConfidence === "medium"
                ? "Moyenne"
                : "Faible"
          }
          reasoning={r.priorityReasoning}
          alreadyApplied={!!priorityAlreadyApplied}
          alreadyAppliedBy={
            currentPrioritySource === "AI" ? "IA (auto)" : undefined
          }
          onAccept={applyPriority}
          onReject={() => recordAction("rejected")}
          onReview={async (verdict) => {
            if (!r.priority) return;
            await sendTriageFeedback("priority", r.priority, verdict);
          }}
        />
      )}

      {/* Type */}
      {r.suggestedType && (
        <SuggestionRow
          label="Type"
          value={TYPE_LABEL[r.suggestedType] ?? r.suggestedType}
          alreadyApplied={false}
          onAccept={applyType}
          onReject={() => recordAction("rejected")}
          onReview={async (verdict) => {
            if (!r.suggestedType) return;
            await sendTriageFeedback("type", r.suggestedType, verdict);
          }}
        />
      )}

      {/* Doublon potentiel */}
      {r.possibleDuplicateOfId && (
        <DuplicateHint
          duplicateId={r.possibleDuplicateOfId}
          reason={r.possibleDuplicateReason}
          onReview={(verdict) =>
            sendTriageFeedback("duplicate", r.possibleDuplicateOfId!, verdict)
          }
        />
      )}

      {/* Incident majeur */}
      {r.majorIncidentHint?.detected && (
        <div className="rounded-md border border-red-200 bg-red-50/70 px-2 py-1.5">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 text-red-700 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold text-red-900">
                Incident majeur probable
              </p>
              <p className="text-[11px] text-red-800">
                {r.majorIncidentHint.reason ??
                  `${r.majorIncidentHint.relatedTicketIds.length} tickets similaires ouverts récemment.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-600 pt-1 border-t border-violet-200">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ligne de suggestion compacte — valeur + accept/reject
// ---------------------------------------------------------------------------
function SuggestionRow(props: {
  label: string;
  value: string;
  confidence?: number;
  confidenceLabel?: string;
  reasoning?: string;
  alreadyApplied: boolean;
  alreadyAppliedBy?: string;
  onAccept: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
  /** Callback optionnel pour un feedback "good/bad" explicite (review).
   *  Si fourni, affiche les boutons 👍 / 👎 à côté des accept/reject. */
  onReview?: (verdict: "good" | "bad") => void | Promise<void>;
}) {
  const [state, setState] = useState<"pending" | "accepting" | "rejected">(
    "pending",
  );
  const [reviewed, setReviewed] = useState<"good" | "bad" | null>(null);
  const {
    label,
    value,
    confidence,
    confidenceLabel,
    reasoning,
    alreadyApplied,
    alreadyAppliedBy,
    onAccept,
    onReject,
    onReview,
  } = props;

  async function handleAccept() {
    setState("accepting");
    try {
      await onAccept();
      setState("accepting"); // on garde l'UI en accepté — le refetch parent enlèvera l'item
    } catch {
      setState("pending");
    }
  }

  async function handleReject() {
    setState("rejected");
    await onReject();
  }

  // Quand la suggestion est déjà appliquée, on affiche quand même les
  // boutons de feedback (thumbs up/down). Le tech peut avoir cliqué accepter
  // puis réalisé que la catégorie était mauvaise — garder le canal de
  // feedback ouvert alimente le learner `category-feedback-learner`. Sans
  // ce feedback post-apply, on perd ~40% du signal (les suggestions
  // auto-appliquées tombent sous `alreadyApplied=true` immédiatement).
  if (alreadyApplied) {
    return (
      <div className="flex items-center justify-between gap-2 text-[11.5px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-slate-500 shrink-0">{label} :</span>
          <span className="text-slate-800 truncate">{value}</span>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {onReview && (
            <>
              <button
                type="button"
                onClick={() => {
                  setReviewed("good");
                  void onReview("good");
                }}
                disabled={reviewed !== null}
                className={cn(
                  "h-6 w-6 inline-flex items-center justify-center rounded transition",
                  reviewed === "good"
                    ? "bg-emerald-100 text-emerald-700"
                    : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30",
                )}
                title="Suggestion pertinente — confirme au modèle"
              >
                <ThumbsUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setReviewed("bad");
                  void onReview("bad");
                }}
                disabled={reviewed !== null}
                className={cn(
                  "h-6 w-6 inline-flex items-center justify-center rounded transition",
                  reviewed === "bad"
                    ? "bg-rose-100 text-rose-700"
                    : "text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30",
                )}
                title="Mauvaise suggestion — signale au modèle"
              >
                <ThumbsDown className="h-3 w-3" />
              </button>
              <span className="mx-0.5 h-3 w-px bg-slate-200" />
            </>
          )}
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            <span className="text-[10.5px]">
              Appliquée{alreadyAppliedBy ? ` (${alreadyAppliedBy})` : ""}
            </span>
          </span>
        </div>
      </div>
    );
  }

  if (state === "rejected") return null;

  return (
    <div className="flex items-start justify-between gap-2 text-[11.5px]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 shrink-0">{label} :</span>
          <span className="text-slate-900 font-medium truncate">{value}</span>
          {confidence != null && (
            <span className="text-[10px] text-slate-400 tabular-nums">
              ({Math.round(confidence * 100)}%)
            </span>
          )}
          {confidenceLabel && (
            <span className="text-[10px] text-slate-400">
              · conf. {confidenceLabel}
            </span>
          )}
        </div>
        {reasoning && (
          <p className="text-[10.5px] text-slate-500 mt-0.5">{reasoning}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {onReview && (
          <>
            <button
              type="button"
              onClick={() => {
                setReviewed("good");
                void onReview("good");
              }}
              disabled={reviewed !== null}
              className={cn(
                "h-6 w-6 inline-flex items-center justify-center rounded transition",
                reviewed === "good"
                  ? "bg-emerald-100 text-emerald-700"
                  : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30",
              )}
              title="Pertinent — entraîne le modèle"
            >
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                setReviewed("bad");
                void onReview("bad");
              }}
              disabled={reviewed !== null}
              className={cn(
                "h-6 w-6 inline-flex items-center justify-center rounded transition",
                reviewed === "bad"
                  ? "bg-rose-100 text-rose-700"
                  : "text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30",
              )}
              title="Mauvaise catégorie — entraîne le modèle"
            >
              <ThumbsDown className="h-3 w-3" />
            </button>
            <span className="mx-0.5 h-3 w-px bg-slate-200" />
          </>
        )}
        <button
          type="button"
          onClick={handleAccept}
          disabled={state === "accepting"}
          className="h-6 w-6 inline-flex items-center justify-center rounded text-emerald-700 hover:bg-emerald-100"
          title="Accepter"
        >
          {state === "accepting" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
        </button>
        <button
          type="button"
          onClick={handleReject}
          className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Rejeter"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hint doublon probable avec boutons review inline. On sort ça en composant
// pour gérer son propre état "reviewed" + l'optimistic UI.
// ---------------------------------------------------------------------------
function DuplicateHint({
  duplicateId,
  reason,
  onReview,
}: {
  duplicateId: string;
  reason?: string;
  onReview: (verdict: "good" | "bad") => void | Promise<void>;
}) {
  const [reviewed, setReviewed] = useState<"good" | "bad" | null>(null);

  return (
    <div
      className={cn(
        "rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1.5",
        reviewed === "bad" && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1.5">
        <Link2 className="h-3 w-3 text-amber-700 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold text-amber-900">
            Doublon probable
          </p>
          <p className="text-[11px] text-amber-800">
            {reason ??
              "Un ticket ouvert récent décrit probablement le même problème."}
          </p>
          <a
            href={`/tickets/${duplicateId}`}
            className={cn(
              "inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-amber-900 underline hover:text-amber-950",
              reviewed === "bad" && "pointer-events-none line-through",
            )}
          >
            Ouvrir le ticket lié
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            disabled={reviewed !== null}
            onClick={() => {
              setReviewed("good");
              void onReview("good");
            }}
            className={cn(
              "h-6 w-6 inline-flex items-center justify-center rounded transition",
              reviewed === "good"
                ? "bg-emerald-100 text-emerald-700"
                : "text-amber-600 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30",
            )}
            title="C'est bien un doublon"
          >
            <ThumbsUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={reviewed !== null}
            onClick={() => {
              setReviewed("bad");
              void onReview("bad");
            }}
            className={cn(
              "h-6 w-6 inline-flex items-center justify-center rounded transition",
              reviewed === "bad"
                ? "bg-rose-100 text-rose-700"
                : "text-amber-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30",
            )}
            title="Faux doublon"
          >
            <ThumbsDown className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
