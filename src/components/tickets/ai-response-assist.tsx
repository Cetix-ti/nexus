"use client";

// ============================================================================
// AI Response Assist — bouton + drawer sur la fiche ticket.
//
// Clic sur "Assistance IA" → lance POST /api/v1/tickets/[id]/ai-assist et
// ouvre un drawer latéral avec :
//   - brouillon de réponse client (bouton "Copier dans la réponse")
//   - pistes de diagnostic (liste ordonnée)
//   - étapes de vérification
//   - commandes suggérées avec bouton "Copier"
//   - tickets similaires déjà résolus (liens vers fiches)
//
// Design copilote : aucun write automatique. L'agent copie / édite ce
// qu'il veut. Les actions humaines (accept / reject sur le brouillon)
// sont logées pour la calibration.
// ============================================================================

import { useCallback, useState } from "react";
import {
  Sparkles,
  Loader2,
  X,
  Copy,
  Check,
  Terminal,
  BookOpen,
  Lightbulb,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FeedbackButtons } from "@/components/ai/feedback-buttons";

interface AssistResult {
  clientDraft: string;
  diagnosticSteps: string[];
  verificationSteps: string[];
  commands: Array<{
    platform: "powershell" | "cmd" | "bash" | "fortigate" | "other";
    command: string;
    purpose: string;
  }>;
  similarResolvedTickets: Array<{
    id: string;
    number: number;
    subject: string;
    resolution: string;
  }>;
}

interface Props {
  ticketId: string;
  /** Callback appelé quand l'utilisateur clique "Copier dans la réponse".
   *  Le parent (fiche ticket) doit injecter le texte dans son composer. */
  onInsertDraft?: (text: string) => void;
}

const PLATFORM_LABEL: Record<AssistResult["commands"][number]["platform"], string> = {
  powershell: "PowerShell",
  cmd: "CMD",
  bash: "Bash",
  fortigate: "FortiGate CLI",
  other: "Commande",
};

export function AiResponseAssist({ ticketId, onInsertDraft }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssistResult | null>(null);
  const [invocationId, setInvocationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/ai-assist`, {
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
  }, [ticketId]);

  async function recordAction(action: "accepted" | "rejected" | "edited") {
    if (!invocationId) return;
    try {
      await fetch(`/api/v1/ai/invocations/${invocationId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      // Non bloquant
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
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        Assistance IA
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
                <Sparkles className="h-4 w-4 text-violet-500" />
                <h2 className="text-[14px] font-semibold text-slate-900">
                  Assistance IA
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
                  Analyse en cours… (lecture des tickets similaires + génération)
                </div>
              )}

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  {error}
                </div>
              )}

              {result && (
                <>
                  {/* Brouillon client */}
                  <Section
                    icon={<BookOpen className="h-3.5 w-3.5 text-blue-600" />}
                    title="Brouillon de réponse client"
                  >
                    <div className="rounded-md border border-blue-100 bg-blue-50/40 px-3 py-2 text-[12.5px] text-slate-800 whitespace-pre-wrap">
                      {result.clientDraft ||
                        "(l'IA n'a pas produit de brouillon — vérifier le contexte du ticket)"}
                    </div>
                    {result.clientDraft && (
                      <div className="mt-2 flex items-center gap-2">
                        {onInsertDraft && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              onInsertDraft(result.clientDraft);
                              recordAction("accepted");
                              setOpen(false);
                            }}
                          >
                            <Check className="h-3 w-3" />
                            Insérer dans la réponse
                          </Button>
                        )}
                        <CopyButton text={result.clientDraft} />
                        <button
                          type="button"
                          onClick={() => recordAction("rejected")}
                          className="text-[11.5px] text-slate-500 hover:text-slate-800"
                        >
                          Non pertinent
                        </button>
                      </div>
                    )}
                  </Section>

                  {/* Pistes de diagnostic */}
                  {result.diagnosticSteps.length > 0 && (
                    <Section
                      icon={<Lightbulb className="h-3.5 w-3.5 text-amber-600" />}
                      title="Pistes de diagnostic"
                    >
                      <ol className="list-decimal list-inside space-y-1.5 text-[12.5px] text-slate-800">
                        {result.diagnosticSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </Section>
                  )}

                  {/* Étapes de vérification */}
                  {result.verificationSteps.length > 0 && (
                    <Section
                      icon={<ListChecks className="h-3.5 w-3.5 text-emerald-600" />}
                      title="Étapes de vérification"
                    >
                      <ul className="list-disc list-inside space-y-1.5 text-[12.5px] text-slate-800">
                        {result.verificationSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Commandes */}
                  {result.commands.length > 0 && (
                    <Section
                      icon={<Terminal className="h-3.5 w-3.5 text-slate-700" />}
                      title="Commandes techniques suggérées"
                    >
                      <div className="space-y-2.5">
                        {result.commands.map((c, i) => (
                          <div
                            key={i}
                            className="rounded-md border border-slate-200 bg-slate-50"
                          >
                            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-slate-200">
                              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-600">
                                {PLATFORM_LABEL[c.platform]}
                              </span>
                              <CopyButton text={c.command} compact />
                            </div>
                            <pre className="px-2.5 py-2 text-[11.5px] font-mono text-slate-800 whitespace-pre-wrap overflow-x-auto">
                              {c.command}
                            </pre>
                            {c.purpose && (
                              <p className="px-2.5 pb-1.5 text-[11px] text-slate-500">
                                {c.purpose}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        ⚠ Vérifie chaque commande avant exécution. L'IA peut se tromper.
                      </p>
                    </Section>
                  )}

                  {/* Tickets similaires */}
                  {result.similarResolvedTickets.length > 0 && (
                    <Section
                      icon={<BookOpen className="h-3.5 w-3.5 text-slate-600" />}
                      title={`Tickets similaires déjà résolus (${result.similarResolvedTickets.length})`}
                    >
                      <div className="space-y-1.5">
                        {result.similarResolvedTickets.map((t) => (
                          <a
                            key={t.id}
                            href={`/tickets/${t.id}`}
                            className="block rounded-md border border-slate-200 bg-white px-2.5 py-1.5 hover:border-blue-300 hover:bg-slate-50 transition-colors"
                          >
                            <p className="text-[12px] font-medium text-slate-800 truncate">
                              #{t.number} — {t.subject}
                            </p>
                            {t.resolution && (
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                {t.resolution}
                              </p>
                            )}
                          </a>
                        ))}
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

function CopyButton({ text, compact }: { text: string; compact?: boolean }) {
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
        "inline-flex items-center gap-1 rounded text-[11px] font-medium transition-colors",
        compact
          ? "h-5 px-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          : "h-7 px-2 border border-slate-200 text-slate-600 hover:bg-slate-50",
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
