"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================================
// PAGE — Aperçu PDF d'un rapport mensuel client, à l'intérieur de la PWA.
//
// Évite la sortie de contexte standalone sur mobile : sans cette page, le
// clic "PDF" ouvrait un nouvel onglet qui faisait quitter l'application
// (iOS/Android n'ont pas de bouton retour vers la PWA depuis Safari/Chrome
// en mode hors-app).
//
// La page affiche le PDF dans un <iframe> et propose un bouton Téléchar-
// ger qui force l'attachment (sheet de partage native) en gardant la PWA
// active en arrière-plan.
// ============================================================================
export default function MonthlyReportPreviewPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const id = params?.id;
  const variant = search?.get("variant") ?? null; // "hours_only" | null
  const isHoursOnly = variant === "hours_only";

  const pdfBase = `/api/v1/reports/monthly/${id}/pdf`;
  const pdfQuery = isHoursOnly ? "?variant=hours_only" : "";
  const pdfUrl = `${pdfBase}${pdfQuery}`;
  const downloadUrl =
    `${pdfBase}${pdfQuery}${pdfQuery ? "&" : "?"}download=1`;

  const [loading, setLoading] = useState(true);
  // iOS Safari peut mettre quelques secondes à charger un PDF dans un
  // iframe — on cache un spinner en attendant onLoad.
  useEffect(() => {
    setLoading(true);
  }, [pdfUrl]);

  if (!id) {
    return (
      <div className="p-6 text-sm text-slate-500">Identifiant manquant.</div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Toolbar — sticky en haut. Bouton retour pour ne jamais sortir
          de la PWA, et téléchargement explicite. */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-1.5"
        >
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

      {/* Viewer — iframe en pleine hauteur. */}
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
    </div>
  );
}
