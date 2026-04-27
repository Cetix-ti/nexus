"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================================
// PAGE — Aperçu PDF d'un rapport mensuel client, à l'intérieur de la PWA.
//
// Sur desktop : iframe inline (Chrome/Firefox/Edge gèrent PDF nativement).
// Sur mobile : pas d'iframe — iOS Safari/PWA et Android Chrome ne rendent
// PAS de manière fiable un PDF en iframe (écran blanc, ou seulement la 1ère
// page, ou un placeholder "Tap to open"). On affiche à la place une grosse
// carte avec :
//   - "Ouvrir" → navigation same-tab vers le PDF inline. iOS et Android
//     ouvrent leur viewer PDF natif (overlay) sans quitter la PWA. L'user
//     ferme l'overlay et revient à la PWA active.
//   - "Télécharger" → ?download=1 force attachment, ouvre la sheet de
//     partage native (Fichiers, AirDrop, mail, etc.).
// ============================================================================

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod|android|mobi/.test(ua);
}

export default function MonthlyReportPreviewPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const id = params?.id;
  const variant = search?.get("variant") ?? null;
  const isHoursOnly = variant === "hours_only";

  const pdfBase = `/api/v1/reports/monthly/${id}/pdf`;
  const pdfQuery = isHoursOnly ? "?variant=hours_only" : "";
  const pdfUrl = `${pdfBase}${pdfQuery}`;
  const downloadUrl = `${pdfBase}${pdfQuery}${pdfQuery ? "&" : "?"}download=1`;

  // userAgent n'est dispo que côté client → on initialise à false, puis
  // on bascule au premier render. Évite la mismatch SSR/CSR.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
  }, [pdfUrl]);

  if (!id) {
    return <div className="p-6 text-sm text-slate-500">Identifiant manquant.</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
        <div className="flex-1 min-w-0 text-center text-[13px] font-medium text-slate-700 truncate">
          Rapport mensuel{isHoursOnly ? " — heures seulement" : ""}
        </div>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a href={downloadUrl}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Télécharger</span>
          </a>
        </Button>
      </div>

      {/* Viewer */}
      {isMobile ? (
        <div className="flex-1 flex items-center justify-center bg-slate-100 px-6 py-10">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
              <FileText className="h-7 w-7" strokeWidth={2} />
            </div>
            <h2 className="text-[16px] font-semibold text-slate-900">
              Rapport mensuel{isHoursOnly ? " (heures seulement)" : ""}
            </h2>
            <p className="mt-1 text-[12.5px] text-slate-500 leading-relaxed">
              Sur mobile, le PDF s&apos;ouvre dans le visualiseur natif de
              ton appareil. Tu peux revenir à Nexus en fermant le PDF.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button asChild variant="primary" className="gap-1.5">
                <a href={pdfUrl}>
                  <FileText className="h-4 w-4" />
                  Ouvrir le PDF
                </a>
              </Button>
              <Button asChild variant="outline" className="gap-1.5">
                <a href={downloadUrl}>
                  <Download className="h-4 w-4" />
                  Télécharger
                </a>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex-1 bg-slate-100">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}
          <iframe
            src={pdfUrl}
            title="Aperçu PDF"
            className="absolute inset-0 w-full h-full bg-white"
            onLoad={() => setLoading(false)}
          />
        </div>
      )}
    </div>
  );
}
