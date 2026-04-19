"use client";

// ============================================================================
// AI Escalation Brief — bouton + drawer "Préparer escalade".
//
// Quand un ticket stagne ou doit passer à N2, cette fonction produit un
// brief structuré prêt à coller en note interne / courriel. Réduit les
// pertes d'information lors du handoff.
// ============================================================================

import { useState } from "react";
import {
  Forward,
  Loader2,
  X,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  ListChecks,
  Target,
  FileStack,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FeedbackButtons } from "@/components/ai/feedback-buttons";

interface Brief {
  contextSummary: string;
  stepsTried: string[];
  currentHypothesis: string;
  bestNextActions: string[];
  suggestedDestination: string;
  logsToAttach: string[];
  urgencyRationale: string;
  brief: string;
}

interface Props {
  ticketId: string;
  /** Insère le brief complet dans le composer comme note interne. */
  onInsertDraft?: (text: string) => void;
}

export function AiEscalationBrief({ ticketId, onInsertDraft }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [invocationId, setInvocationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/ai-escalation`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setBrief(data.result);
      setInvocationId(data.invocationId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function recordAction(action: "accepted" | "rejected") {
    if (!invocationId) return;
    try {
      await fetch(`/api/v1/ai/invocations/${invocationId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      /* non bloquant */
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          if (!brief && !loading) run();
        }}
      >
        <Forward className="h-3.5 w-3.5 text-orange-600" />
        Préparer escalade
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed right-0 top-0 h-screen w-full max-w-2xl bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Forward className="h-4 w-4 text-orange-600" />
                <h2 className="text-[14px] font-semibold text-slate-900">
                  Brief d'escalade
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {brief && invocationId && (
                  <FeedbackButtons
                    invocationId={invocationId}
                    label="Utile ?"
                  />
                )}
                {brief && (
                  <Button size="sm" variant="outline" onClick={run} disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Régénérer
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="p-5 space-y-5">
              {loading && (
                <div className="flex items-center gap-2 text-[13px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Synthèse du ticket en cours…
                </div>
              )}

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  {error}
                </div>
              )}

              {brief && (
                <>
                  {/* Actions en haut */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {onInsertDraft && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          onInsertDraft(brief.brief);
                          recordAction("accepted");
                          setOpen(false);
                        }}
                      >
                        <Check className="h-3 w-3" />
                        Insérer en note interne
                      </Button>
                    )}
                    <CopyButton text={brief.brief} label="Copier le brief complet" />
                  </div>

                  {/* Suggested destination */}
                  {brief.suggestedDestination && (
                    <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-800 mb-1 flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        Destination suggérée
                      </p>
                      <p className="text-[13px] font-semibold text-orange-900">
                        {brief.suggestedDestination}
                      </p>
                      {brief.urgencyRationale &&
                        brief.urgencyRationale !== "—" && (
                          <p className="text-[11.5px] text-orange-800 mt-1 flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            {brief.urgencyRationale}
                          </p>
                        )}
                    </div>
                  )}

                  {/* Contexte */}
                  <Section title="Contexte">
                    <p className="text-[12.5px] text-slate-800">
                      {brief.contextSummary}
                    </p>
                  </Section>

                  {/* Steps tried */}
                  {brief.stepsTried.length > 0 && (
                    <Section
                      icon={<ListChecks className="h-3.5 w-3.5 text-slate-600" />}
                      title="Déjà tenté"
                    >
                      <ol className="list-decimal list-inside space-y-1 text-[12.5px] text-slate-800">
                        {brief.stepsTried.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </Section>
                  )}

                  {/* Hypothesis */}
                  {brief.currentHypothesis && (
                    <Section title="Hypothèse actuelle">
                      <p className="text-[12.5px] italic text-slate-700">
                        {brief.currentHypothesis}
                      </p>
                    </Section>
                  )}

                  {/* Recommended actions */}
                  {brief.bestNextActions.length > 0 && (
                    <Section title="Pistes recommandées pour le N2">
                      <ul className="list-disc list-inside space-y-1 text-[12.5px] text-slate-800">
                        {brief.bestNextActions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Logs */}
                  {brief.logsToAttach.length > 0 && (
                    <Section
                      icon={<FileStack className="h-3.5 w-3.5 text-slate-600" />}
                      title="À joindre / consulter"
                    >
                      <ul className="list-disc list-inside space-y-1 text-[12.5px] text-slate-800">
                        {brief.logsToAttach.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </Section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded h-7 px-2 border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50",
      )}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-600" />
          Copié
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          {label ?? "Copier"}
        </>
      )}
    </button>
  );
}
