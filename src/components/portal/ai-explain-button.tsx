"use client";

import { useState } from "react";
import { Sparkles, Languages, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  kind: "particularity" | "policy_document" | "change";
  id: string;
}

export function AiExplainButton({ kind, id }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"summarize" | "explain" | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(capability: "summarize" | "explain") {
    setMode(capability); setLoading(true); setError(null); setText(null); setOpen(true);
    const r = await fetch(`/api/portal/ai/explain`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, capability }),
    });
    setLoading(false);
    if (!r.ok) { setError("IA indisponible"); return; }
    const d = await r.json();
    if (!d.ok) { setError(d.error ?? "Erreur"); return; }
    setText(d.text ?? null);
  }

  return (
    <div className="mt-3">
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-[11.5px]" onClick={() => run("summarize")}>
          <Sparkles className="h-3.5 w-3.5" /> Résumer
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-[11.5px]" onClick={() => run("explain")}>
          <Languages className="h-3.5 w-3.5" /> Expliquer simplement
        </Button>
      </div>

      {open && (
        <div className="mt-3 rounded-lg bg-violet-50 border border-violet-200 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-violet-900 inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {mode === "summarize" ? "Résumé" : "Explication simplifiée"}
            </div>
            <button onClick={() => { setOpen(false); setText(null); setError(null); }} className="text-violet-700 hover:text-violet-900">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {loading && <div className="text-[12.5px] text-violet-800">Analyse IA en cours…</div>}
          {error && <div className="text-[12.5px] text-red-700">{error}</div>}
          {text && <pre className="text-[12.5px] text-slate-800 whitespace-pre-wrap font-sans">{text}</pre>}
          <p className="text-[10.5px] text-violet-600 italic">Généré par IA — vérifiez avec votre équipe si une décision en dépend.</p>
        </div>
      )}
    </div>
  );
}
