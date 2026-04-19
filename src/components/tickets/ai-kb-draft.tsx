"use client";

// ============================================================================
// AI KB Draft — bouton qui propose un brouillon d'article de base de
// connaissances à partir d'un ticket résolu. L'admin copie/colle les
// champs dans le formulaire KB standard (pas de création automatique).
// ============================================================================

import { useState } from "react";
import {
  BookOpenCheck,
  Loader2,
  X,
  Copy,
  Check,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FeedbackButtons } from "@/components/ai/feedback-buttons";

interface Draft {
  title: string;
  summary: string;
  body: string;
  tags: string[];
  suggestedVisibility: "internal" | "public";
}

export function AiKbDraftButton({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [invocationId, setInvocationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/ai-kb-draft`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDraft(data.draft);
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
          if (!draft && !loading) run();
        }}
      >
        <BookOpenCheck className="h-3.5 w-3.5 text-indigo-600" />
        Proposer un article KB
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
                <BookOpenCheck className="h-4 w-4 text-indigo-600" />
                <h2 className="text-[14px] font-semibold text-slate-900">
                  Brouillon d'article KB
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {draft && invocationId && (
                  <FeedbackButtons
                    invocationId={invocationId}
                    label="Utile ?"
                  />
                )}
                {draft && (
                  <Button size="sm" variant="outline" onClick={run} disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <BookOpenCheck className="h-3 w-3" />
                    )}
                    Régénérer
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (draft) recordAction("rejected");
                  }}
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
                  Extraction de la structure KB depuis l'historique du ticket…
                </div>
              )}

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  {error}
                </div>
              )}

              {draft && (
                <>
                  <p className="text-[11.5px] text-slate-500">
                    L'IA a produit ce brouillon à partir des notes du ticket.
                    Copie-le dans le formulaire de création d'article, édite à
                    ta convenance, puis publie quand c'est prêt.
                  </p>

                  <Field label="Titre" value={draft.title} />
                  <Field label="Résumé" value={draft.summary} multiline />
                  <Field label="Contenu (Markdown)" value={draft.body} multiline large />

                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-600">
                      Tags suggérés
                    </label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {draft.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {t}
                        </span>
                      ))}
                    </div>
                    <CopyButton text={draft.tags.join(", ")} label="Copier les tags" />
                  </div>

                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-600">
                      Visibilité suggérée
                    </label>
                    <p className="mt-1 text-[12.5px] text-slate-700">
                      {draft.suggestedVisibility === "public" ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-200 text-emerald-800 text-[11.5px]">
                          Public (accessible via portail client)
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 ring-1 ring-slate-200 text-slate-700 text-[11.5px]">
                          Interne (Cetix uniquement)
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="sticky bottom-0 bg-white pt-3 pb-4 -mx-5 px-5 border-t border-slate-200 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        recordAction("rejected");
                        setOpen(false);
                      }}
                      className="text-[12px] text-slate-500 hover:text-slate-800"
                    >
                      Ce ticket ne mérite pas un article
                    </button>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => {
                        recordAction("accepted");
                        // Redirige vers la page KB — l'admin colle
                        // manuellement les champs. Future amélioration :
                        // passer le draft via query params ou localStorage
                        // pour préremplir.
                        window.location.href = "/knowledge";
                      }}
                    >
                      <Check className="h-3 w-3" />
                      Ouvrir la base de connaissances
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  multiline,
  large,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  large?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-600">
          {label}
        </label>
        <CopyButton text={value} />
      </div>
      <div
        className={cn(
          "rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-800",
          multiline && "whitespace-pre-wrap",
          large && "max-h-96 overflow-y-auto",
        )}
      >
        {value || <span className="italic text-slate-400">(vide)</span>}
      </div>
    </div>
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
      className="inline-flex items-center gap-1 rounded h-6 px-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
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
