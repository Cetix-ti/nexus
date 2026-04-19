"use client";

// ============================================================================
// <FeedbackButtons /> — composant partagé pour enregistrer humanAction sur
// une invocation IA (thumbs up/down, optionnellement un état édité).
//
// Pattern standard après une réponse IA : le composant est monté à côté de
// la sortie IA et envoie accepted|rejected à /api/v1/ai/invocations/[id]/action
// dès que l'utilisateur clique. État visuel local : une fois voté, les autres
// boutons sont verrouillés (évite le double-vote) mais peuvent être annulés
// via la prop `allowUndo` si besoin.
//
// Indispensable pour fermer les feedback loops des learners (triage, category,
// similar, meta). Sans câblage UI, les jobs d'apprentissage tournent à vide.
// ============================================================================

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeedbackAction = "accepted" | "rejected" | "edited";

interface FeedbackButtonsProps {
  /** ID de l'invocation IA à flagger. Si null/undefined, le composant se
   *  rend silencieusement vide (l'hôte n'a pas encore reçu d'invocationId). */
  invocationId?: string | null;
  /** Callback optionnel post-vote (ex: re-fetch parent). */
  onVoted?: (action: FeedbackAction) => void;
  /** Masque le bouton "édité" si la feature ne supporte pas l'édition. */
  hideEdited?: boolean;
  /** Texte court descriptif — affiché comme label à côté. */
  label?: string;
  /** Classes Tailwind complémentaires pour le conteneur. */
  className?: string;
  /** Variante compacte (boutons plus petits). */
  size?: "sm" | "md";
}

export function FeedbackButtons({
  invocationId,
  onVoted,
  hideEdited = true,
  label,
  className,
  size = "sm",
}: FeedbackButtonsProps) {
  const [voted, setVoted] = useState<FeedbackAction | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!invocationId) return null;

  async function send(action: FeedbackAction) {
    if (!invocationId || sending || voted !== null) return;
    setSending(true);
    setError(null);
    // Optimiste : on affiche immédiatement le feedback.
    setVoted(action);
    try {
      const res = await fetch(
        `/api/v1/ai/invocations/${invocationId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onVoted?.(action);
    } catch (err) {
      // Rollback visuel si le serveur refuse.
      setVoted(null);
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSending(false);
    }
  }

  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const btnClass =
    size === "sm"
      ? "h-6 w-6 rounded inline-flex items-center justify-center transition disabled:opacity-40"
      : "h-7 w-7 rounded inline-flex items-center justify-center transition disabled:opacity-40";

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      {label && (
        <span className="text-[10.5px] text-slate-500 mr-0.5">{label}</span>
      )}
      <button
        type="button"
        onClick={() => send("accepted")}
        disabled={voted !== null || sending}
        className={cn(
          btnClass,
          voted === "accepted"
            ? "bg-emerald-100 text-emerald-700"
            : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600",
        )}
        title="Suggestion utile — entraîne le modèle"
        aria-pressed={voted === "accepted"}
      >
        {voted === "accepted" ? <Check className={iconSize} /> : <ThumbsUp className={iconSize} />}
      </button>
      {!hideEdited && (
        <button
          type="button"
          onClick={() => send("edited")}
          disabled={voted !== null || sending}
          className={cn(
            btnClass,
            voted === "edited"
              ? "bg-blue-100 text-blue-700"
              : "text-slate-400 hover:bg-blue-50 hover:text-blue-600",
          )}
          title="Acceptée avec modifications"
          aria-pressed={voted === "edited"}
        >
          <Pencil className={iconSize} />
        </button>
      )}
      <button
        type="button"
        onClick={() => send("rejected")}
        disabled={voted !== null || sending}
        className={cn(
          btnClass,
          voted === "rejected"
            ? "bg-rose-100 text-rose-700"
            : "text-slate-400 hover:bg-rose-50 hover:text-rose-600",
        )}
        title="Mauvaise suggestion — signale au modèle"
        aria-pressed={voted === "rejected"}
      >
        {voted === "rejected" ? <X className={iconSize} /> : <ThumbsDown className={iconSize} />}
      </button>
      {error && (
        <span className="text-[10px] text-rose-600 ml-1" title={error}>
          !
        </span>
      )}
    </div>
  );
}
