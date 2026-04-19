"use client";

// ============================================================================
// AI Resolution Notes — bouton + drawer sur la fiche ticket.
//
// Clic → génère deux notes (interne + client) à partir de l'historique.
// Drawer affiche cause, correctif listé, recommandation, note interne,
// résumé client. Chaque section avec bouton "Copier" ou "Insérer dans la
// réponse". Pas de write automatique.
// ============================================================================

import { useState } from "react";
import {
  FileCheck2,
  Loader2,
  X,
  Copy,
  Check,
  User,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FeedbackButtons } from "@/components/ai/feedback-buttons";

interface ResolutionNotes {
  cause: string;
  correctif: string[];
  recommandationPreventive: string;
  noteInterne: string;
  resumeClient: string;
}

interface Props {
  ticketId: string;
  onInsertDraft?: (text: string) => void;
}

export function AiResolutionNotes({ ticketId, onInsertDraft }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolutionNotes | null>(null);
  const [invocationId, setInvocationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/ai-resolution`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data.result);
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
          if (!result && !loading) run();
        }}
      >
        <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
        Note de résolution IA
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed right-0 top-0 h-screen w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-emerald-600" />
                <h2 className="text-[14px] font-semibold text-slate-900">
                  Note de résolution IA
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {result && invocationId && (
                  <FeedbackButtons
                    invocationId={invocationId}
                    label="Utile ?"
                  />
                )}
                {result && (
                  <Button size="sm" variant="outline" onClick={run} disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FileCheck2 className="h-3 w-3" />
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
                  Analyse de l'historique… (diagnostic + rédaction)
                </div>
              )}

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  {error}
                </div>
              )}

              {result && (
                <>
                  {/* Cause */}
                  {result.cause && (
                    <Section
                      icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                      title="Cause identifiée"
                    >
                      <p className="text-[12.5px] text-slate-800">
                        {result.cause}
                      </p>
                    </Section>
                  )}

                  {/* Correctif */}
                  {result.correctif.length > 0 && (
                    <Section
                      icon={<Settings className="h-3.5 w-3.5 text-slate-600" />}
                      title="Correctif appliqué"
                    >
                      <ol className="list-decimal list-inside space-y-1 text-[12.5px] text-slate-800">
                        {result.correctif.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ol>
                    </Section>
                  )}

                  {/* Recommandation */}
                  {result.recommandationPreventive && (
                    <Section
                      icon={<AlertTriangle className="h-3.5 w-3.5 text-blue-600" />}
                      title="Recommandation préventive"
                    >
                      <p className="text-[12.5px] text-slate-800 italic">
                        {result.recommandationPreventive}
                      </p>
                    </Section>
                  )}

                  {/* Note interne */}
                  {result.noteInterne && (
                    <Section
                      icon={<Settings className="h-3.5 w-3.5 text-amber-700" />}
                      title="Note interne (technique)"
                    >
                      <div className="rounded-md border border-amber-100 bg-amber-50/40 px-3 py-2 text-[12.5px] text-slate-800 whitespace-pre-wrap">
                        {result.noteInterne}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {onInsertDraft && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              onInsertDraft(result.noteInterne);
                              recordAction("accepted");
                              setOpen(false);
                            }}
                          >
                            <Check className="h-3 w-3" />
                            Insérer comme note interne
                          </Button>
                        )}
                        <CopyButton text={result.noteInterne} />
                      </div>
                    </Section>
                  )}

                  {/* Résumé client */}
                  {result.resumeClient && (
                    <Section
                      icon={<User className="h-3.5 w-3.5 text-blue-600" />}
                      title="Résumé client (vulgarisé)"
                    >
                      <div className="rounded-md border border-blue-100 bg-blue-50/40 px-3 py-2 text-[12.5px] text-slate-800 whitespace-pre-wrap">
                        {result.resumeClient}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {onInsertDraft && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              onInsertDraft(result.resumeClient);
                              recordAction("accepted");
                              setOpen(false);
                            }}
                          >
                            <Check className="h-3 w-3" />
                            Insérer comme réponse client
                          </Button>
                        )}
                        <CopyButton text={result.resumeClient} />
                        <button
                          type="button"
                          onClick={() => recordAction("rejected")}
                          className="text-[11.5px] text-slate-500 hover:text-slate-800"
                        >
                          Non pertinent
                        </button>
                      </div>
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
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
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
          /* clipboard refusé — silencieux */
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
          Copier
        </>
      )}
    </button>
  );
}
