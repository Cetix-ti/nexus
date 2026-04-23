"use client";

// Bouton d'export d'un dashboard avec dialog de configuration.
// Permet de choisir le format (PDF/PNG/JPG), le nom du fichier, et
// l'orientation pour le PDF. Utilise dashboard-export qui capture
// [data-print-target] via html-to-image (compatible Tailwind 4 oklch).

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, Loader2, Check, AlertTriangle, X } from "lucide-react";
import { exportDashboard, type ExportFormat } from "@/lib/analytics/dashboard-export";

interface Props {
  /** Nom du dashboard courant — utilisé pour préremplir le nom du fichier. */
  dashboardLabel: string;
}

export function ExportDashboardButton({ dashboardLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [result, setResult] = useState<{ ok: true; format: ExportFormat } | { ok: false; message: string } | null>(null);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(t);
  }, [result]);

  const today = new Date().toISOString().slice(0, 10);
  const defaultName = `${sanitizeFilename(dashboardLabel)}-${today}`;

  async function doExport(filename: string, format: ExportFormat, orientation: "portrait" | "landscape") {
    setOpen(false);
    setBusy(format);
    setResult(null);
    try {
      await exportDashboard({ filename, format, orientation });
      setResult({ ok: true, format });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      setResult({ ok: false, message: msg });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy !== null}
        className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 px-2.5 text-[12.5px] font-medium transition-all disabled:opacity-50"
        title="Exporter le dashboard"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{busy ? `Export ${busy.toUpperCase()}…` : "Exporter"}</span>
      </button>

      {open && (
        <ExportDialog
          defaultName={defaultName}
          onClose={() => setOpen(false)}
          onExport={doExport}
        />
      )}

      {result && (
        <div
          className={`absolute right-0 top-full mt-1 z-40 w-72 rounded-lg border px-3 py-2 text-[12px] shadow-lg flex items-start gap-2 ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {result.ok ? <Check className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          <div>
            {result.ok
              ? `Export ${result.format.toUpperCase()} généré. Téléchargement en cours.`
              : `Échec de l'export : ${result.message}`}
          </div>
        </div>
      )}
    </div>
  );
}

interface ExportDialogProps {
  defaultName: string;
  onClose: () => void;
  onExport: (filename: string, format: ExportFormat, orientation: "portrait" | "landscape") => void;
}

function ExportDialog({ defaultName, onClose, onExport }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [filename, setFilename] = useState(defaultName);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const finalName = sanitizeFilename(filename) || "dashboard";

  function submit() {
    onExport(finalName, format, orientation);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-2">
            <Download className="h-4 w-4 text-blue-600" /> Exporter le dashboard
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-4">
          <div>
            <label className="block text-[11.5px] font-medium text-slate-600 mb-1.5">Format</label>
            <div className="grid grid-cols-3 gap-1.5">
              <FormatButton
                active={format === "pdf"}
                onClick={() => setFormat("pdf")}
                icon={<FileText className="h-4 w-4 text-red-600" />}
                label="PDF"
                hint="A4"
              />
              <FormatButton
                active={format === "png"}
                onClick={() => setFormat("png")}
                icon={<ImageIcon className="h-4 w-4 text-blue-600" />}
                label="PNG"
                hint="Image"
              />
              <FormatButton
                active={format === "jpg"}
                onClick={() => setFormat("jpg")}
                icon={<ImageIcon className="h-4 w-4 text-emerald-600" />}
                label="JPG"
                hint="Léger"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-medium text-slate-600 mb-1.5">Nom du fichier</label>
            <input
              ref={inputRef}
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
              placeholder="nom-du-fichier"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Résultat : <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-700">{finalName}.{format}</code>
            </p>
          </div>

          {format === "pdf" && (
            <div>
              <label className="block text-[11.5px] font-medium text-slate-600 mb-1.5">Orientation</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setOrientation("landscape")}
                  className={`rounded-md border px-3 py-2 text-[12.5px] font-medium transition-colors ${
                    orientation === "landscape"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Paysage
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation("portrait")}
                  className={`rounded-md border px-3 py-2 text-[12.5px] font-medium transition-colors ${
                    orientation === "portrait"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Portrait
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!finalName}
            className="text-[13px] rounded bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> Exporter
          </button>
        </div>
      </div>
    </div>
  );
}

function FormatButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-2 text-left transition-colors ${
        active
          ? "border-blue-500 bg-blue-50"
          : "border-slate-300 bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[12.5px] font-semibold text-slate-900">{label}</span>
      </div>
      <div className="text-[10.5px] text-slate-500 mt-0.5">{hint}</div>
    </button>
  );
}

function sanitizeFilename(s: string): string {
  return s
    .trim()
    .replace(/[\/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
