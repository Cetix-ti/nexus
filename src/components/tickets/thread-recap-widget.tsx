"use client";

// ============================================================================
// Widget "Récap du fil" — page ticket.
//
// Affiche uniquement pour les tickets avec ≥ 8 commentaires (consolidés par
// le job `thread-consolidator`). Présente 4 sections en vue condensée :
// situation · décisions · essais · questions ouvertes.
//
// Un tech qui prend un ticket en main a une vue de 15 secondes au lieu de
// dérouler 50 messages.
// ============================================================================

import { useEffect, useState } from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface AttemptedFix {
  fix: string;
  outcome: "success" | "failure" | "pending";
}

interface ThreadRecap {
  ticketId: string;
  commentCount: number;
  situation: string;
  decisionsTaken: string[];
  attemptedFixes: AttemptedFix[];
  openQuestions: string[];
  lastConsolidatedAt: string;
}

export function ThreadRecapWidget({ ticketId }: { ticketId: string }) {
  const [recap, setRecap] = useState<ThreadRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/v1/tickets/${ticketId}/thread-recap`);
        if (!res.ok) return;
        const data = (await res.json()) as { recap: ThreadRecap | null };
        if (!cancelled) setRecap(data.recap);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (loading) return null;
  if (!recap) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/30">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 border-b border-indigo-200 px-4 py-2.5 text-left dark:border-indigo-900"
      >
        <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <span className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
          Récap du fil
        </span>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
          {recap.commentCount} messages
        </span>
        <span className="ml-auto text-indigo-600 dark:text-indigo-400">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="space-y-4 px-4 py-3 text-sm">
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              Situation
            </h4>
            <p className="text-slate-700 dark:text-slate-200">
              {recap.situation}
            </p>
          </section>

          {recap.decisionsTaken.length > 0 && (
            <section>
              <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                <CheckCircle2 className="h-3 w-3" /> Décisions prises
              </h4>
              <ul className="list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-200">
                {recap.decisionsTaken.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </section>
          )}

          {recap.attemptedFixes.length > 0 && (
            <section>
              <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Essais techniques
              </h4>
              <ul className="space-y-1 text-slate-700 dark:text-slate-200">
                {recap.attemptedFixes.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {a.outcome === "success" ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : a.outcome === "failure" ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                    ) : (
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span>{a.fix}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {recap.openQuestions.length > 0 && (
            <section>
              <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                <HelpCircle className="h-3 w-3" /> Questions en suspens
              </h4>
              <ul className="list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-200">
                {recap.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-[10px] italic text-indigo-600/70 dark:text-indigo-400/70">
            Consolidé le{" "}
            {new Date(recap.lastConsolidatedAt).toLocaleString("fr-CA")}.
            Regénéré automatiquement quand le fil grossit.
          </p>
        </div>
      )}
    </div>
  );
}
