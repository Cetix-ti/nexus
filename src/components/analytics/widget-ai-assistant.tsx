"use client";

// Widget AI Assistant — panneau de chat intégré dans l'éditeur de widgets.
// L'utilisateur décrit son besoin en français, l'assistant génère la config
// du widget (ou pose des questions de clarification), et un clic sur
// "Appliquer" remplit le formulaire d'édition.

import { useEffect, useRef, useState } from "react";
import { X, Sparkles, Send, Check, Loader2, AlertTriangle } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  widget?: WidgetDraft;
}

export interface WidgetDraft {
  name: string;
  description?: string;
  chartType: string;
  color?: string;
  query: {
    dataset: string;
    filters: Array<{ field: string; operator: string; value: string }>;
    groupBy: string;
    aggregate: string;
    aggregateField: string;
    sortBy: string;
    sortDir: string;
    limit: number;
    dateField: string;
    dateFrom: string;
    dateTo: string;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Applique le widget généré au formulaire d'édition. */
  onApply: (widget: WidgetDraft) => void;
}

const SUGGESTIONS = [
  "Combien de déplacements j'ai facturés ?",
  "Tickets résolus par technicien ce mois-ci",
  "Évolution mensuelle des heures facturables",
  "Top 10 clients par revenu",
  "Tickets ouverts par priorité",
  "Heures non facturables par catégorie de base",
];

export function WidgetAiAssistant({ open, onClose, onApply }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMessages([
        {
          role: "assistant",
          content:
            "👋 Dis-moi ce que tu veux visualiser et je crée le widget pour toi. Par exemple : « Combien de déplacements j'ai facturés ? » ou « Tickets résolus par technicien ce mois-ci ».",
        },
      ]);
      setInput("");
    }
  }, [open]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/v1/analytics/widget-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages([...next, { role: "assistant", content: data?.error ?? `Erreur ${res.status}` }]);
        return;
      }
      if (data.action === "create" && data.widget) {
        setMessages([...next, { role: "assistant", content: data.message ?? "Voici le widget.", widget: data.widget }]);
      } else {
        setMessages([...next, { role: "assistant", content: data.message ?? "Je n'ai pas compris." }]);
      }
    } catch (err) {
      setMessages([...next, { role: "assistant", content: `Erreur réseau : ${err instanceof Error ? err.message : ""}` }]);
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40">
      <div className="relative w-full sm:max-w-xl h-full sm:h-auto sm:max-h-[90vh] bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <div>
              <h2 className="text-[14px] font-semibold leading-tight">Assistant de création</h2>
              <p className="text-[11px] text-white/80 leading-tight">Décris ton widget, je le crée</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 text-white px-3.5 py-2 text-[13px] whitespace-pre-wrap"
                    : "max-w-[92%] rounded-2xl rounded-tl-sm bg-white ring-1 ring-slate-200 text-slate-800 px-3.5 py-2 text-[13px] whitespace-pre-wrap"
                }
              >
                {m.content}
                {m.widget && (
                  <WidgetPreview
                    widget={m.widget}
                    onApply={() => { onApply(m.widget!); onClose(); }}
                  />
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex">
              <div className="rounded-2xl rounded-tl-sm bg-white ring-1 ring-slate-200 text-slate-500 px-3.5 py-2 text-[13px] inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Réflexion…
              </div>
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 shrink-0">
            <p className="text-[10.5px] text-slate-500 mb-1.5">Suggestions :</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-[11.5px] rounded-full bg-white ring-1 ring-slate-200 px-2.5 py-1 hover:bg-violet-50 hover:ring-violet-300 hover:text-violet-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 px-3 py-2 shrink-0 flex items-center gap-2 bg-white">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Décris le widget que tu veux…"
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="h-9 w-9 shrink-0 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 inline-flex items-center justify-center"
            aria-label="Envoyer"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Preview d'un widget proposé par l'IA — avec test live et bouton Appliquer
// ----------------------------------------------------------------------------
function WidgetPreview({ widget, onApply }: { widget: WidgetDraft; onApply: () => void }) {
  const [test, setTest] = useState<{ ok: boolean; sampleLabel?: string; count?: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch("/api/v1/analytics/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(widget.query),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setTest({ ok: false, error: data?.error ?? `HTTP ${res.status}` });
      } else {
        const sample = Array.isArray(data.results) && data.results.length > 0 ? data.results[0] : null;
        setTest({
          ok: true,
          sampleLabel: sample?.label,
          count: Array.isArray(data.results) ? data.results.length : 0,
        });
      }
    } catch (err) {
      setTest({ ok: false, error: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mt-2 pt-2 border-t border-slate-200 space-y-1.5">
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-[11.5px] text-slate-700">
        <div className="font-semibold text-slate-900">{widget.name}</div>
        {widget.description && <div className="text-slate-500">{widget.description}</div>}
        <div className="mt-1 flex items-center gap-1 flex-wrap text-[10.5px] text-slate-600">
          <span className="rounded bg-white ring-1 ring-slate-200 px-1.5 py-0.5">{widget.query.dataset}</span>
          <span className="rounded bg-white ring-1 ring-slate-200 px-1.5 py-0.5">{widget.query.aggregate}</span>
          {widget.query.groupBy && <span className="rounded bg-white ring-1 ring-slate-200 px-1.5 py-0.5">↳ {widget.query.groupBy}</span>}
          <span className="rounded bg-white ring-1 ring-slate-200 px-1.5 py-0.5">{widget.chartType}</span>
          {widget.query.filters.length > 0 && (
            <span className="rounded bg-amber-50 text-amber-700 px-1.5 py-0.5">
              {widget.query.filters.length} filtre{widget.query.filters.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {test && test.ok && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800 inline-flex items-center gap-1.5">
          <Check className="h-3 w-3" />
          Test OK — {test.count} résultat{(test.count ?? 0) > 1 ? "s" : ""}
          {test.sampleLabel && ` (ex: « ${test.sampleLabel} »)`}
        </div>
      )}
      {test && !test.ok && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 inline-flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>Test échoué : {test.error}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={runTest}
          disabled={testing}
          className="text-[11.5px] rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-40"
        >
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Tester
        </button>
        <button
          onClick={onApply}
          className="text-[11.5px] rounded bg-emerald-600 text-white px-2.5 py-1 hover:bg-emerald-700 inline-flex items-center gap-1"
        >
          <Check className="h-3 w-3" /> Appliquer dans l&apos;éditeur
        </button>
      </div>
    </div>
  );
}
