"use client";

import { useState } from "react";
import { Sparkles, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiActionsBar, type AiAction } from "@/components/shared/ai-actions-bar";

interface Props {
  kind: "software_instance" | "software_template" | "gpo_template" | "gpo_instance" | "script_template" | "script_instance" | "policy_document" | "change";
  id: string;
  actions?: AiAction[];
  /** Si défini, appelé avec le résultat texte quand l'utilisateur clique "Appliquer". */
  onApply?: (capability: AiAction, text: string, data: unknown) => void;
}

const DEFAULT_ACTIONS: AiAction[] = [
  "correct", "rewrite", "restructure", "summarize",
  "suggest_category", "suggest_tags", "detect_missing",
];

export function AiInlinePanel({ kind, id, actions = DEFAULT_ACTIONS, onApply }: Props) {
  const [result, setResult] = useState<{ capability: AiAction; text?: string; data?: unknown; error?: string; loading?: boolean } | null>(null);

  async function run(capability: AiAction) {
    setResult({ capability, loading: true });
    const r = await fetch(`/api/v1/ai/content-assist`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, capability }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.ok) {
      setResult({ capability, error: d?.error ?? "IA indisponible" });
      return;
    }
    setResult({ capability, text: d.text, data: d.data });
  }

  function handleApply() {
    if (!result || !onApply) return;
    onApply(result.capability, result.text ?? "", result.data);
    setResult(null);
  }

  return (
    <div className="space-y-2">
      <AiActionsBar actions={actions} onRun={run} />
      {result && (
        <div className={`rounded-lg p-3 space-y-2 ${result.error ? "bg-red-50 border border-red-200" : "bg-violet-50 border border-violet-200"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[12px] font-semibold inline-flex items-center gap-1.5 ${result.error ? "text-red-800" : "text-violet-900"}`}>
              {result.error ? <AlertCircle className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {result.error ? "Erreur" : "Résultat IA"}
            </span>
            <button onClick={() => setResult(null)} className="text-slate-500 hover:text-slate-800"><X className="h-3.5 w-3.5" /></button>
          </div>
          {result.loading && <div className="text-[12.5px] text-violet-800">Analyse en cours…</div>}
          {result.error && <div className="text-[12.5px] text-red-700">{result.error}</div>}
          {result.text && (
            <pre className="text-[12.5px] text-slate-800 whitespace-pre-wrap font-sans">{result.text}</pre>
          )}
          {result.data != null && !result.text && (
            <AiDataBlock capability={result.capability} data={result.data} />
          )}
          {(result.text || result.data != null) && onApply && (
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setResult(null)}>Ignorer</Button>
              <Button size="sm" onClick={handleApply}>Appliquer</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AiDataBlock({ capability, data }: { capability: AiAction; data: any }) {
  if (capability === "suggest_category" && data?.categoryName) {
    return (
      <div className="text-[12.5px] text-slate-800">
        Catégorie proposée : <strong>{data.categoryName}</strong>
        {data.confidence && <span className="text-violet-700"> ({data.confidence})</span>}
        {data.reasoning && <p className="mt-1 text-[12px] text-violet-700">{data.reasoning}</p>}
      </div>
    );
  }
  if (capability === "suggest_tags" && Array.isArray(data?.tags)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {data.tags.map((t: string) => (
          <span key={t} className="rounded bg-white px-2 py-0.5 text-[11px] ring-1 ring-violet-200">{t}</span>
        ))}
      </div>
    );
  }
  if (capability === "detect_missing" && Array.isArray(data?.missing)) {
    return (
      <ul className="list-disc pl-5 space-y-0.5 text-[12.5px] text-slate-800">
        {data.missing.length === 0
          ? <li>Rien à signaler — la fiche est complète.</li>
          : data.missing.map((m: any, i: number) => <li key={i}><strong>{m.field}</strong>{m.reason && ` — ${m.reason}`}</li>)}
      </ul>
    );
  }
  return <pre className="text-[11px] text-slate-700 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
}
