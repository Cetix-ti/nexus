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
          setSuggestions(data.suggestions);
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
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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
                "group/row relative flex items-start gap-1",
                currentFeedback === "bad" && "opacity-40",
              )}
            >
              <Link
                href={`/knowledge/${s.articleId}`}
                className={cn(
                  "flex-1 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50",
                  currentFeedback === "bad" && "pointer-events-none line-through",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {s.title}
                      </div>
                      {s.sameCategory && (
                        <CheckCircle2
                          className="h-3 w-3 text-emerald-500"
                          aria-label="Même catégorie que ce ticket"
                        />
                      )}
                    </div>
                    {s.summary && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {s.summary}
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
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

              {/* Boutons review — s'affichent au hover de la ligne. */}
              <div className="flex items-center gap-0.5 pr-3 pt-3 opacity-0 transition-opacity group-hover/row:opacity-100">
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
