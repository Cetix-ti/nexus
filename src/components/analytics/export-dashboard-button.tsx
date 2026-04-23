"use client";

// Bouton d'export d'un dashboard avec menu PDF / PNG / JPG.
// Utilise le module dashboard-export qui capture [data-print-target].

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, Loader2, Check, AlertTriangle } from "lucide-react";
import { exportDashboard, type ExportFormat } from "@/lib/analytics/dashboard-export";

interface Props {
  /** Nom du dashboard courant — utilisé pour le nom du fichier. */
  dashboardLabel: string;
}

export function ExportDashboardButton({ dashboardLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [result, setResult] = useState<{ ok: true; format: ExportFormat } | { ok: false; message: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(t);
  }, [result]);

  async function doExport(format: ExportFormat) {
    setOpen(false);
    setBusy(format);
    setResult(null);
    try {
      const slug = sanitizeFilename(dashboardLabel);
      const today = new Date().toISOString().slice(0, 10);
      await exportDashboard({
        filename: `${slug}-${today}`,
        format,
        orientation: "landscape",
      });
      setResult({ ok: true, format });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      setResult({ ok: false, message: msg });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={busy !== null}
        className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 px-2.5 text-[12.5px] font-medium transition-all disabled:opacity-50"
        title="Exporter le dashboard"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{busy ? `Export ${busy.toUpperCase()}…` : "Exporter"}</span>
      </button>

      {open && !busy && (
        <div className="absolute right-0 top-full mt-1 z-40 w-56 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
          <ExportOption
            icon={<FileText className="h-4 w-4 text-red-600" />}
            label="PDF (paysage A4)"
            hint="Multi-pages si besoin"
            onClick={() => doExport("pdf")}
          />
          <ExportOption
            icon={<ImageIcon className="h-4 w-4 text-blue-600" />}
            label="PNG (image)"
            hint="Qualité maximale, fond transparent"
            onClick={() => doExport("png")}
          />
          <ExportOption
            icon={<ImageIcon className="h-4 w-4 text-emerald-600" />}
            label="JPG (image compressée)"
            hint="Plus léger, idéal pour email"
            onClick={() => doExport("jpg")}
          />
        </div>
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

function ExportOption({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
    >
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-500">{hint}</div>
      </div>
    </button>
  );
}

function sanitizeFilename(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "dashboard";
}
