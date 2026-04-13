"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App Error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
      <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">
        Une erreur est survenue
      </h2>
      <p className="text-sm text-slate-500 max-w-md text-center">
        Cette page a rencontré un problème inattendu. Essayez de recharger la page.
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Recharger la page
      </button>
      {error.digest && (
        <p className="text-[11px] text-slate-400 font-mono">Code : {error.digest}</p>
      )}
    </div>
  );
}
