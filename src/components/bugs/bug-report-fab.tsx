"use client";

// Bouton flottant de signalement de bug + modal de saisie.
// Affiché globalement via AppLayout. Full-screen sur mobile pour garantir
// l'accessibilité des boutons (user feedback).

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, X, AlertTriangle, Check, Image as ImageIcon } from "lucide-react";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// Buffer circulaire des dernières erreurs console — permet de joindre
// automatiquement les erreurs récentes au rapport.
const CONSOLE_BUFFER: string[] = [];
const CONSOLE_BUFFER_MAX = 20;
let consolePatched = false;

function patchConsoleOnce() {
  if (consolePatched || typeof window === "undefined") return;
  consolePatched = true;
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...args: unknown[]) => {
    CONSOLE_BUFFER.push(`[error] ${args.map((a) => safeToString(a)).join(" ")}`);
    if (CONSOLE_BUFFER.length > CONSOLE_BUFFER_MAX) CONSOLE_BUFFER.shift();
    origError.apply(console, args as never);
  };
  console.warn = (...args: unknown[]) => {
    CONSOLE_BUFFER.push(`[warn] ${args.map((a) => safeToString(a)).join(" ")}`);
    if (CONSOLE_BUFFER.length > CONSOLE_BUFFER_MAX) CONSOLE_BUFFER.shift();
    origWarn.apply(console, args as never);
  };
  window.addEventListener("error", (ev) => {
    CONSOLE_BUFFER.push(`[onerror] ${ev.message} @ ${ev.filename}:${ev.lineno}`);
    if (CONSOLE_BUFFER.length > CONSOLE_BUFFER_MAX) CONSOLE_BUFFER.shift();
  });
  window.addEventListener("unhandledrejection", (ev) => {
    CONSOLE_BUFFER.push(`[promise] ${safeToString(ev.reason)}`);
    if (CONSOLE_BUFFER.length > CONSOLE_BUFFER_MAX) CONSOLE_BUFFER.shift();
  });
}

function safeToString(v: unknown): string {
  if (v instanceof Error) return v.message + (v.stack ? `\n${v.stack}` : "");
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function BugReportFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { patchConsoleOnce(); }, []);

  return (
    <>
      {!open && (
        <button
          data-floating-ui
          onClick={() => setOpen(true)}
          className="fixed z-40 inline-flex items-center gap-1.5 bg-slate-900 text-white rounded-full shadow-lg hover:bg-slate-800 px-3.5 py-2.5 text-[13px] font-medium bottom-24 right-4 sm:bottom-6 sm:right-24"
          aria-label="Signaler un bug"
          title="Signaler un bug"
        >
          <Bug className="h-4 w-4" />
          <span className="hidden sm:inline">Signaler un bug</span>
        </button>
      )}
      {open && <BugReportModal onClose={() => setOpen(false)} contextUrl={pathname} />}
    </>
  );
}

function BugReportModal({ onClose, contextUrl }: { onClose: () => void; contextUrl: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [screenshots, setScreenshots] = useState<string[]>([]); // data: URLs
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleFileInput(files: FileList | null) {
    if (!files) return;
    const arr: string[] = [...screenshots];
    for (const f of Array.from(files).slice(0, 3 - arr.length)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 2 * 1024 * 1024) { setError(`${f.name} trop gros (max 2Mo)`); continue; }
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsDataURL(f);
      });
      arr.push(dataUrl);
    }
    setScreenshots(arr);
  }

  async function submit() {
    setError(null);
    if (!title.trim() || !description.trim()) {
      setError("Titre et description requis");
      return;
    }
    setSubmitting(true);
    const contextMeta = {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      viewport: typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : null,
      locale: typeof navigator !== "undefined" ? navigator.language : null,
      recentConsole: CONSOLE_BUFFER.slice(-10),
      ts: new Date().toISOString(),
    };
    const r = await fetch("/api/v1/bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        stepsToReproduce: steps.trim() || null,
        severity,
        contextUrl,
        contextMeta,
        screenshots: screenshots.length ? screenshots : null,
      }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setError(body?.error || `Erreur HTTP ${r.status}`);
      return;
    }
    setSuccess(true);
    setTimeout(onClose, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50">
      <div className="relative w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[90vh] bg-white sm:rounded-xl shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <div className="inline-flex items-center gap-2">
            <Bug className="h-5 w-5 text-amber-600" />
            <h2 className="text-[15px] font-semibold text-slate-900">Signaler un bug</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {success ? (
            <div className="text-center py-8">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm text-slate-900 font-medium">Bug signalé</p>
              <p className="text-[12px] text-slate-500">Merci pour le retour.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[12px] text-slate-700 font-medium">Titre *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ex: Bouton Enregistrer ne fonctionne pas sur la page organisation"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-[14px]"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[12px] text-slate-700 font-medium">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Que s'est-il passé ? Qu'attendiez-vous ?"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-[14px]"
                />
              </div>
              <div>
                <label className="text-[12px] text-slate-700 font-medium">Étapes pour reproduire</label>
                <textarea
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  rows={3}
                  placeholder="1. Aller sur /organisations/X&#10;2. Cliquer sur …&#10;3. Résultat observé"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-[13px] font-mono"
                />
              </div>
              <div>
                <label className="text-[12px] text-slate-700 font-medium">Sévérité</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1">
                  {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as Severity[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeverity(s)}
                      className={`text-[12px] rounded px-2 py-1.5 border ${
                        severity === s ? SEVERITY_STYLE[s].active : SEVERITY_STYLE[s].idle
                      }`}
                    >
                      {SEVERITY_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[12px] text-slate-700 font-medium">Captures d&apos;écran (max 3, 2Mo chacune)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => void handleFileInput(e.target.files)}
                  className="hidden"
                />
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-[12px] rounded border border-slate-300 px-2.5 py-1.5 hover:bg-slate-50"
                    disabled={screenshots.length >= 3}
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> Ajouter
                  </button>
                  {screenshots.map((s, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <div key={i} className="relative h-12 w-12 rounded border border-slate-300 overflow-hidden">
                      <img src={s} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => setScreenshots(screenshots.filter((_, j) => j !== i))}
                        className="absolute top-0 right-0 bg-slate-900/80 text-white h-4 w-4 text-[10px] flex items-center justify-center"
                        type="button"
                        aria-label="Retirer"
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded bg-slate-50 border border-slate-200 p-2.5 text-[11.5px] text-slate-600">
                <div className="font-medium text-slate-700 mb-0.5 inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Contexte attaché automatiquement
                </div>
                <div className="font-mono break-all">URL : {contextUrl}</div>
                <div>Navigateur + 10 dernières erreurs console incluses.</div>
              </div>

              {error && (
                <div className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {!success && (
          <div className="border-t border-slate-200 px-4 py-3 shrink-0 flex items-center justify-end gap-2 flex-wrap">
            <button onClick={onClose} className="text-[13px] rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={submit}
              disabled={submitting || !title.trim() || !description.trim()}
              className="text-[13px] rounded bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const SEVERITY_LABEL: Record<Severity, string> = {
  LOW: "Mineur",
  MEDIUM: "Moyen",
  HIGH: "Majeur",
  CRITICAL: "Critique",
};

const SEVERITY_STYLE: Record<Severity, { active: string; idle: string }> = {
  LOW: { active: "bg-slate-900 text-white border-slate-900", idle: "border-slate-300 text-slate-700 hover:border-slate-400" },
  MEDIUM: { active: "bg-amber-600 text-white border-amber-600", idle: "border-slate-300 text-slate-700 hover:border-amber-400" },
  HIGH: { active: "bg-orange-600 text-white border-orange-600", idle: "border-slate-300 text-slate-700 hover:border-orange-400" },
  CRITICAL: { active: "bg-red-600 text-white border-red-600", idle: "border-slate-300 text-slate-700 hover:border-red-400" },
};
