"use client";

import { cn } from "@/lib/utils";

/**
 * Animated skeleton loader shown while a page fetches its initial data.
 * Use as a drop-in replacement for "Aucun résultat" empty states pendant
 * que `loaded === false`.
 *
 * Variants :
 * - "table"   : header + N skeleton rows  (org list, contacts, assets…)
 * - "cards"   : grille de cartes squelette (kanban, dashboard widgets)
 * - "detail"  : header + 2-col content    (page détail)
 * - "spinner" : simple spinner centré
 */
export function PageLoader({
  variant = "table",
  rows = 8,
  label,
  className,
}: {
  variant?: "table" | "cards" | "detail" | "spinner";
  rows?: number;
  label?: string;
  className?: string;
}) {
  if (variant === "spinner") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-16",
          className
        )}
      >
        <Spinner />
        {label ? (
          <p className="text-[12.5px] text-slate-500">{label}</p>
        ) : null}
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Shimmer key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Shimmer key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className={cn("flex flex-col gap-6", className)}>
        <div className="flex items-center gap-4">
          <Shimmer className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-5 w-2/5 rounded" />
            <Shimmer className="h-3 w-1/4 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Shimmer className="h-44 rounded-2xl" />
            <Shimmer className="h-32 rounded-2xl" />
            <Shimmer className="h-56 rounded-2xl" />
          </div>
          <div className="space-y-4">
            <Shimmer className="h-32 rounded-2xl" />
            <Shimmer className="h-32 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // table (default)
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className
      )}
    >
      <div className="border-b border-slate-200/70 bg-slate-50/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <Shimmer className="h-3 w-24 rounded" />
          <Shimmer className="h-3 w-16 rounded" />
          <Shimmer className="ml-auto h-3 w-20 rounded" />
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3"
            style={{ opacity: 1 - i * 0.07 }}
          >
            <Shimmer className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Shimmer className="h-3 w-2/5 rounded" />
              <Shimmer className="h-2.5 w-1/4 rounded" />
            </div>
            <Shimmer className="hidden h-3 w-16 rounded sm:block" />
            <Shimmer className="hidden h-3 w-20 rounded md:block" />
            <Shimmer className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
      {label ? (
        <div className="border-t border-slate-100 px-4 py-2.5 text-center text-[11.5px] text-slate-400">
          {label}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Shimmer block — barre dégradée animée. Utilisable directement pour
 * composer des squelettes sur mesure.
 */
export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-slate-200/60",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent",
        "before:animate-[shimmer_1.4s_infinite]",
        className
      )}
    />
  );
}

function Spinner() {
  return (
    <div className="relative h-8 w-8">
      <div className="absolute inset-0 rounded-full border-2 border-slate-200" />
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-600 animate-spin" />
    </div>
  );
}
