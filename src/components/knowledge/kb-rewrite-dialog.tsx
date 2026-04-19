"use client";

// ============================================================================
// KB Rewrite Dialog — UI de reformulation d'article par l'IA.
//
// Flux :
//   1. Admin clique "Reformuler avec IA" dans l'éditeur d'article
//   2. Dialog s'ouvre avec 4 focus possibles (pro / concis / structuré / débutant)
//   3. Spinner pendant l'appel IA (~60-120s avec gemma3:12b local)
//   4. Preview "avant / après" + liste des changements
//   5. "Appliquer" → injecte dans les champs du parent, ferme le dialog
//
// Rien n'est sauvegardé automatiquement : le parent (new-article-modal)
// détient l'état, l'admin peut encore éditer avant de cliquer "Publier".
// ============================================================================

import { useState } from "react";
import {
  X,
  Loader2,
  Sparkles,
  CheckCircle2,
  Briefcase,
  Minimize2,
  ListOrdered,
  Baby,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RewriteFocus = "professional" | "concise" | "structured" | "beginner";

interface RewriteResult {
  newTitle: string;
  newSummary: string;
  newBody: string;
  changes: string[];
}

const FOCUS_OPTIONS: Array<{
  key: RewriteFocus;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: "professional",
    label: "Professionnel",
    description: "Corrige, harmonise le ton, retire le familier",
    icon: <Briefcase className="h-3.5 w-3.5" />,
  },
  {
    key: "concise",
    label: "Concis",
    description: "Trim le superflu, condense sans perdre l'info",
    icon: <Minimize2 className="h-3.5 w-3.5" />,
  },
  {
    key: "structured",
    label: "Structuré",
    description: "Ajoute titres, listes, étapes numérotées",
    icon: <ListOrdered className="h-3.5 w-3.5" />,
  },
  {
    key: "beginner",
    label: "Débutant",
    description: "Vulgarise le vocabulaire, explique le pourquoi",
    icon: <Baby className="h-3.5 w-3.5" />,
  },
];

export function KbRewriteDialog({
  open,
  currentTitle,
  currentSummary,
  currentBody,
  onClose,
  onApply,
}: {
  open: boolean;
  currentTitle: string;
  currentSummary: string;
  currentBody: string;
  onClose: () => void;
  onApply: (next: {
    title: string;
    summary: string;
    body: string;
  }) => void;
}) {
  const [focus, setFocus] = useState<RewriteFocus>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RewriteResult | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/ai/kb-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: currentTitle,
          summary: currentSummary,
          body: currentBody,
          focus,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!result) return;
    onApply({
      title: result.newTitle,
      summary: result.newSummary,
      body: result.newBody,
    });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h2 className="text-[15px] font-semibold text-slate-900">
              Reformuler avec l'IA
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Focus picker (always visible) */}
          <div>
            <p className="text-[12.5px] font-semibold text-slate-700 mb-2">
              Type de reformulation
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {FOCUS_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setFocus(opt.key)}
                  disabled={loading}
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                    focus === opt.key
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800">
                    {opt.icon}
                    {opt.label}
                  </div>
                  <p className="text-[10.5px] text-slate-500 mt-0.5 leading-tight">
                    {opt.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Action row */}
          {!result && (
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={run}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {loading ? "Reformulation en cours…" : "Lancer la reformulation"}
              </Button>
              <p className="text-[10.5px] text-slate-500">
                Ollama local — 1-2 min. Le fond technique n'est pas modifié,
                seulement la forme.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </div>
          )}

          {result && (
            <>
              {/* Changements résumés */}
              {result.changes.length > 0 && (
                <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wider text-violet-700 mb-1.5">
                    Changements appliqués
                  </p>
                  <ul className="text-[12px] text-slate-700 space-y-0.5 list-disc list-inside">
                    {result.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview avant/après */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <SideBySide
                  side="before"
                  title={currentTitle}
                  summary={currentSummary}
                  body={currentBody}
                />
                <SideBySide
                  side="after"
                  title={result.newTitle}
                  summary={result.newSummary}
                  body={result.newBody}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {result && (
          <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
            <Button variant="outline" size="sm" onClick={run} disabled={loading}>
              <Sparkles className="h-3 w-3" />
              Relancer avec un autre focus
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Annuler
              </Button>
              <Button variant="primary" size="sm" onClick={apply}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Appliquer la nouvelle version
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SideBySide({
  side,
  title,
  summary,
  body,
}: {
  side: "before" | "after";
  title: string;
  summary: string;
  body: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 space-y-2",
        side === "after"
          ? "border-emerald-200 bg-emerald-50/30"
          : "border-slate-200 bg-slate-50/40",
      )}
    >
      <div
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wider",
          side === "after" ? "text-emerald-700" : "text-slate-600",
        )}
      >
        {side === "after" ? "Après (IA)" : "Avant"}
      </div>
      <div>
        <p className="text-[10px] font-medium text-slate-500 uppercase">Titre</p>
        <p className="text-[13px] font-medium text-slate-900">{title}</p>
      </div>
      {summary && (
        <div>
          <p className="text-[10px] font-medium text-slate-500 uppercase">
            Résumé
          </p>
          <p className="text-[12.5px] text-slate-700">{summary}</p>
        </div>
      )}
      <div>
        <p className="text-[10px] font-medium text-slate-500 uppercase">Corps</p>
        <div
          className="prose prose-sm max-w-none text-[12.5px] text-slate-800 max-h-[400px] overflow-y-auto border border-slate-200 rounded bg-white p-2 mt-1"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      </div>
    </div>
  );
}
