"use client";

// ============================================================================
// AI Tone Switcher — bouton qui propose de reformuler le texte courant du
// composer selon 4 tonalités. L'agent choisit un ton, voit la version
// reformulée en overlay, puis décide de remplacer ou d'annuler.
//
// Workflow copilote :
//   1. Agent rédige son message
//   2. Clic "Ajuster le ton" → menu avec 4 options
//   3. Clic sur un ton → API rewrite → overlay avec la version reformulée
//   4. Agent clique "Remplacer" (swap) ou "Annuler" (garde original)
//
// Garde toujours l'original accessible — aucune perte.
// ============================================================================

import { useState, useEffect, useRef } from "react";
import {
  Wand2,
  Loader2,
  X,
  Check,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedbackButtons } from "@/components/ai/feedback-buttons";

type Tone = "brief" | "detailed" | "vulgarized" | "executive";

const TONES: Array<{ key: Tone; label: string; hint: string }> = [
  { key: "brief", label: "Bref", hint: "1-2 phrases, direct" },
  {
    key: "detailed",
    label: "Détaillé",
    hint: "Structure claire, explications",
  },
  {
    key: "vulgarized",
    label: "Vulgarisé",
    hint: "Sans jargon, utilisateur final",
  },
  {
    key: "executive",
    label: "Exécutif",
    hint: "Synthétique, pour décideur",
  },
];

interface Props {
  /** Texte courant du composer (peut être HTML ou plain — on envoie tel quel,
   *  l'IA adapte). */
  currentText: string;
  /** Appelé quand l'agent accepte la version reformulée. */
  onReplace: (newText: string) => void;
}

export function AiToneSwitcher({ currentText, onReplace }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingTone, setLoadingTone] = useState<Tone | null>(null);
  const [preview, setPreview] = useState<{
    tone: Tone;
    toneLabel: string;
    rewritten: string;
    original: string;
    invocationId?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function click(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, [menuOpen]);

  async function applyTone(tone: Tone) {
    setMenuOpen(false);
    setError(null);
    setLoadingTone(tone);
    try {
      const res = await fetch("/api/v1/ai/tone-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentText, tone }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPreview({
        tone,
        toneLabel: data.result.toneLabel,
        rewritten: data.result.rewritten,
        original: currentText,
        invocationId: data.result.invocationId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoadingTone(null);
    }
  }

  const canUse = currentText.trim().length >= 10;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          disabled={!canUse || !!loadingTone}
          onClick={() => setMenuOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md h-7 px-2 text-[11.5px] font-medium transition-colors",
            canUse
              ? "border border-slate-200 text-slate-700 hover:bg-slate-50"
              : "border border-slate-200 text-slate-400 cursor-not-allowed",
          )}
          title={
            canUse
              ? "Reformuler avec un autre ton"
              : "Écris au moins 10 caractères pour utiliser cette fonction"
          }
        >
          {loadingTone ? (
            <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
          ) : (
            <Wand2 className="h-3 w-3 text-violet-500" />
          )}
          {loadingTone ? "Reformulation…" : "Ajuster le ton"}
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>

        {menuOpen && (
          <div className="absolute bottom-[calc(100%+6px)] left-0 z-30 w-64 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
            {TONES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => applyTone(t.key)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
              >
                <p className="text-[12.5px] font-medium text-slate-800">
                  {t.label}
                </p>
                <p className="text-[10.5px] text-slate-500">{t.hint}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <span className="text-[11px] text-red-600 ml-2">{error}</span>
      )}

      {/* Overlay preview de la version reformulée */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-2xl rounded-lg bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-violet-500" />
                <h2 className="text-[14px] font-semibold text-slate-900">
                  Ton : {preview.toneLabel}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Version reformulée
                </p>
                <div className="rounded-md border border-violet-200 bg-violet-50/40 px-3 py-2 text-[12.5px] text-slate-800 whitespace-pre-wrap">
                  {preview.rewritten}
                </div>
              </div>
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Original
                </p>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600 whitespace-pre-wrap">
                  {preview.original}
                </div>
              </div>
            </div>

            <footer className="border-t border-slate-200 px-5 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="text-[12px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Garder l'original
              </button>
              <div className="flex items-center gap-2">
                {/* Changer de ton sans fermer */}
                <div className="flex items-center gap-1">
                  {TONES.filter((t) => t.key !== preview.tone).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => applyTone(t.key)}
                      disabled={!!loadingTone}
                      className="inline-flex items-center rounded-md border border-slate-200 px-2 h-7 text-[11px] text-slate-600 hover:bg-slate-50"
                      title={`Essayer : ${t.label}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onReplace(preview.rewritten);
                    setPreview(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-600 text-white px-3 h-7 text-[12px] font-medium hover:bg-violet-700"
                >
                  <Check className="h-3 w-3" />
                  Remplacer
                </button>
              </div>
              {preview.invocationId && (
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[10.5px] text-slate-500">
                    La reformulation est-elle utile ?
                  </span>
                  <FeedbackButtons
                    invocationId={preview.invocationId}
                    size="sm"
                  />
                </div>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
