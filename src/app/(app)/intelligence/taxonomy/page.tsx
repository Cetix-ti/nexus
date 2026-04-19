"use client";

// ============================================================================
// /intelligence/taxonomy — Dédoublonnage de la taxonomie catégories.
// Montre les paires de catégories dont les centroids sémantiques sont très
// similaires (cosine ≥ 0.92) et propose de fusionner.
//
// Destructif : l'action de fusion migre TOUS les tickets et archive la
// source. Double confirmation côté UI.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  ArrowRight,
  Split,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Pair {
  pairId: string;
  smallerCategoryId: string;
  smallerCategoryName: string;
  smallerSampleSize: number;
  largerCategoryId: string;
  largerCategoryName: string;
  largerSampleSize: number;
  similarity: number;
  recommendedMerge: "smaller_into_larger" | "manual_review";
  reasoning: string;
  detectedAt: string;
}

export default function TaxonomyDedupPage() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPair, setBusyPair] = useState<string | null>(null);
  const [confirmPair, setConfirmPair] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/intelligence/taxonomy");
      if (!res.ok) {
        setError(res.status === 403 ? "Accès réservé" : "Erreur");
        return;
      }
      const data = (await res.json()) as { pairs: Pair[] };
      setPairs(data.pairs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMerge = async (p: Pair) => {
    setBusyPair(p.pairId);
    try {
      const res = await fetch("/api/v1/intelligence/taxonomy/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairId: p.pairId,
          sourceCategoryId: p.smallerCategoryId,
          targetCategoryId: p.largerCategoryId,
        }),
      });
      if (res.ok) {
        setConfirmPair(null);
        void load();
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error ?? "Fusion échouée");
      }
    } finally {
      setBusyPair(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <Split className="h-6 w-6 text-indigo-500" />
          Taxonomie — dédoublonnage
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Paires de catégories dont les centroids vectoriels sont très
          similaires (cosine ≥ 0.92). Probables duplicats de la hiérarchie à
          fusionner. Action destructive : la source devient inactive et tous
          ses tickets migrent vers la cible.
        </p>
      </header>

      {pairs.length === 0 ? (
        <p className="py-12 text-center text-sm italic text-slate-400">
          Aucune paire de catégories quasi-dupliquées détectée. Taxonomie
          propre.
        </p>
      ) : (
        <ul className="space-y-3">
          {pairs.map((p) => {
            const isConfirm = confirmPair === p.pairId;
            return (
              <li
                key={p.pairId}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start gap-3">
                  <SimilarityBadge value={p.similarity} />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                      <CategoryPill
                        name={p.smallerCategoryName}
                        sampleSize={p.smallerSampleSize}
                        label="Source (archivée)"
                        tone="slate"
                      />
                      <ArrowRight className="mx-auto h-4 w-4 text-indigo-500" />
                      <CategoryPill
                        name={p.largerCategoryName}
                        sampleSize={p.largerSampleSize}
                        label="Cible (conservée)"
                        tone="indigo"
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {p.reasoning}
                    </p>
                    {p.recommendedMerge === "manual_review" && (
                      <p className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        Volumes équivalents : il peut s&apos;agir de deux
                        domaines distincts. Vérifier manuellement avant de
                        fusionner.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {isConfirm ? (
                      <>
                        <button
                          type="button"
                          disabled={busyPair === p.pairId}
                          onClick={() => handleMerge(p)}
                          className="flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          {busyPair === p.pairId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Confirmer
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmPair(null)}
                          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmPair(p.pairId)}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                      >
                        Fusionner
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SimilarityBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 96
      ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
      : pct >= 94
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300";
  return (
    <span
      className={cn(
        "shrink-0 rounded px-2 py-1 text-xs font-semibold tabular-nums",
        color,
      )}
      title="Similarité cosine des centroids"
    >
      {pct}%
    </span>
  );
}

function CategoryPill({
  name,
  sampleSize,
  label,
  tone,
}: {
  name: string;
  sampleSize: number;
  label: string;
  tone: "slate" | "indigo";
}) {
  const bg =
    tone === "indigo"
      ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/40"
      : "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50";
  return (
    <div className={cn("rounded-md border px-3 py-2", bg)}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
        {name}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        {sampleSize} tickets échantillonnés
      </div>
    </div>
  );
}
