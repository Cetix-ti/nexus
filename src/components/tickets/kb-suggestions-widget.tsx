"use client";

// ============================================================================
// Widget "Articles KB pertinents" — sidebar ticket.
//
// Affiche les articles de la base de connaissances les plus proches
// sémantiquement du ticket ouvert. Alimenté par le job `kb-indexer` et
// l'API `/api/v1/tickets/[id]/suggested-kb` qui calcule le top-3 via
// cosine sur les embeddings.
//
// Zéro config — dès qu'un ticket a son embedding et que 2-3 articles sont
// indexés, les suggestions apparaissent.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Loader2,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggestion {
  articleId: string;
  title: string;
  summary: string;
  similarity: number;
  sameCategory: boolean;
}

export function KbSuggestionsWidget({ ticketId }: { ticketId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, "bad" | "good">>({});

  const sendFeedback = (articleId: string, verdict: "bad" | "good") => {
    setFeedback((s) => ({ ...s, [articleId]: verdict }));
    void fetch(`/api/v1/tickets/${ticketId}/kb-suggestion-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, verdict }),
    }).catch(() => {
      /* silencieux — optimistic UI */
    });
  };


  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/v1/tickets/${ticketId}/suggested-kb`);
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: Suggestion[] };
        if (!cancelled && Array.isArray(data.suggestions)) {
          // Seuil de pertinence : on masque les articles trop éloignés
          // (cosine < 0.55). En dessous, le titre est rarement pertinent
          // et ajoute du bruit dans la sidebar. Si aucun article ne
          // passe le seuil, le widget ne s'affiche pas (cf. return null
          // quand `suggestions.length === 0`).
          const MIN_SIM = 0.55;
          setSuggestions(data.suggestions.filter((s) => s.similarity >= MIN_SIM));
        }
      } catch {
        /* silent — widget optionnel */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Recherche d&apos;articles pertinents…
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Articles KB pertinents
          </span>
          <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            IA
          </span>
        </div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {suggestions.map((s) => {
          const currentFeedback = feedback[s.articleId];
          return (
            <div
              key={s.articleId}
              className={cn(
                "group/row relative min-w-0 transition hover:bg-slate-50 dark:hover:bg-slate-800/50",
                currentFeedback === "bad" && "opacity-40",
              )}
            >
              {/* Bloc principal cliquable — titre libre sur 2 lignes.
                  Badge de similarité en haut à droite (compact), icône
                  "même catégorie" à côté du titre. */}
              <Link
                href={`/knowledge/${s.articleId}`}
                className={cn(
                  "block px-4 py-2.5",
                  currentFeedback === "bad" && "pointer-events-none line-through",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      <div className="flex-1 min-w-0 text-[13px] font-medium text-slate-800 leading-snug line-clamp-2 break-words dark:text-slate-200">
                        {s.title}
                      </div>
                      {s.sameCategory && (
                        <CheckCircle2
                          className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5"
                          aria-label="Même catégorie que ce ticket"
                        />
                      )}
                    </div>
                    {s.summary && (
                      <div className="mt-1 line-clamp-2 text-[11.5px] text-slate-500 leading-snug dark:text-slate-400">
                        {s.summary}
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                      s.similarity >= 0.7
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : s.similarity >= 0.6
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                    )}
                    title={`Similarité sémantique : ${(s.similarity * 100).toFixed(0)}%`}
                  >
                    {(s.similarity * 100).toFixed(0)}%
                  </span>
                </div>
              </Link>

              {/* Actions — rangée séparée, visible au hover. Ne volent
                  plus de largeur au titre. */}
              <div className="flex items-center justify-end gap-0.5 px-3 pb-1.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                {currentFeedback ? (
                  <button
                    type="button"
                    onClick={() =>
                      setFeedback((f) => {
                        const next = { ...f };
                        delete next[s.articleId];
                        return next;
                      })
                    }
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    title="Annuler"
                  >
                    <Undo2 className="h-3 w-3" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        sendFeedback(s.articleId, "good");
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950"
                      title="Pertinent"
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        sendFeedback(s.articleId, "bad");
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                      title="Pas en rapport — exclure"
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
