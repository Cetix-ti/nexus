"use client";

// ============================================================================
// AI Copilot Chat — bouton + panneau Q&A rapide dans la fiche ticket.
//
// Positionné comme "j'ai une question rapide sur ce ticket" — pas un chat
// persistant avec historique. Chaque question est indépendante : le tech
// tape, l'IA répond avec contexte auto-injecté (historique, similaires,
// faits client), et les numéros de tickets cités deviennent cliquables.
//
// Les invocations sont logées via runAiTask → l'admin voit les volumes dans
// Settings > Intelligence IA. Pas de store de conversation pour l'instant.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Loader2, Send, X, Brain, ExternalLink, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackButtons } from "@/components/ai/feedback-buttons";

// Questions courantes — un clic peuple le textarea et laisse le tech
// éditer/compléter avant d'envoyer. Le jeu est volontairement court pour
// ne pas noyer l'UI.
const QUICK_QUESTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: "Tickets similaires ?",
    prompt:
      "Y a-t-il d'autres tickets similaires pour ce client, ouverts ou résolus ? Lesquels ?",
  },
  {
    label: "Par où commencer ?",
    prompt:
      "Par quoi devrais-je commencer pour diagnostiquer ce problème ? Donne-moi 3-5 étapes concrètes.",
  },
  {
    label: "Solutions passées",
    prompt:
      "Comment des tickets similaires ont-ils été résolus dans le passé ? Cite les tickets concernés.",
  },
  {
    label: "Commandes utiles",
    prompt:
      "Quelles commandes (PowerShell, CMD, bash) peuvent aider à investiguer ou corriger ce problème ?",
  },
  {
    label: "Risques / impact",
    prompt:
      "Quels sont les risques et l'impact potentiel si ce problème n'est pas résolu rapidement ?",
  },
  {
    label: "Prêt à fermer ?",
    prompt:
      "Est-ce que ce ticket est prêt à être fermé ? Qu'est-ce qui manque ou devrait être vérifié avant ?",
  },
];

interface CopilotResult {
  answer: string;
  citedTickets: Array<{ id: string; number: number }>;
  citedArticles?: Array<{ id: string; title: string; similarity: number }>;
  invocationId?: string;
}

export function AiCopilotChat({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/ai/copilot-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, question: q }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Brain className="h-3.5 w-3.5 text-indigo-500" />
        Demander à Nexus
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[12.5px] font-semibold text-slate-800 flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-indigo-500" />
          Nexus — question rapide
        </h4>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResult(null);
            setError(null);
          }}
          className="text-slate-400 hover:text-slate-600"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        {/* Suggestions de questions fréquentes — clic = remplit le textarea,
            le tech peut ensuite éditer ou envoyer directement. */}
        <div className="flex flex-wrap gap-1">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setQuestion(q.prompt)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10.5px] text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors disabled:opacity-50"
              title={q.prompt}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {q.label}
            </button>
          ))}
        </div>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ex. : a-t-on déjà eu cette erreur chez ce client ? Comment l'isoler ?"
          className="w-full min-h-[70px] text-[12.5px] rounded-md border border-slate-300 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void ask();
            }
          }}
          maxLength={2000}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10.5px] text-slate-500">
            Ctrl/⌘ + Entrée pour envoyer • contexte ticket + similaires +
            conventions client injectés
          </p>
          <Button
            size="sm"
            variant="primary"
            onClick={ask}
            disabled={loading || !question.trim()}
            className="gap-1"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Envoyer
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-indigo-200 bg-white p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-indigo-600">
              <Sparkles className="h-3 w-3" />
              Réponse
            </div>
            {result.invocationId && (
              <FeedbackButtons
                invocationId={result.invocationId}
                label="Utile ?"
              />
            )}
          </div>
          <p className="text-[12.5px] text-slate-800 whitespace-pre-wrap leading-relaxed">
            {result.answer}
          </p>
          {result.citedTickets.length > 0 && (
            <div className="pt-1 border-t border-indigo-100 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10.5px] text-slate-500">
                Tickets cités :
              </span>
              {result.citedTickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-0.5 text-[11px] text-indigo-700 hover:underline"
                >
                  #{t.number}
                  <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              ))}
            </div>
          )}
          {result.citedArticles && result.citedArticles.length > 0 && (
            <div className="pt-1 border-t border-indigo-100 flex items-start gap-1.5 flex-wrap">
              <span className="text-[10.5px] text-slate-500 pt-0.5">
                KB pertinents :
              </span>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                {result.citedArticles.map((a) => (
                  <Link
                    key={a.id}
                    href={`/knowledge/${a.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-700 hover:underline"
                    title={`Similarité ${Math.round(a.similarity * 100)}%`}
                  >
                    <BookOpen className="h-2.5 w-2.5" />
                    <span className="truncate">{a.title}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {Math.round(a.similarity * 100)}%
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
