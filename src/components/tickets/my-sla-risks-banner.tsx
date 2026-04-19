"use client";

// ============================================================================
// Bannière "Mes tickets à risque SLA" — affichée en haut de /tickets.
//
// Rafraîchit à chaque chargement de la page (pas de polling — le job SLA
// drift predictor tourne toutes les 15 min, c'est suffisant). Dismissible
// via un bouton qui cache la bannière jusqu'au prochain refresh.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Risk {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  riskScore: number;
  reasons: string[];
  currentAgeMinutes: number;
  slaDeadlineMinutes: number | null;
  deadlineSource?: "explicit" | "implicit";
}

export function MySlaRisksBanner() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/intelligence/my-sla-risks");
        if (!res.ok) return;
        const data = (await res.json()) as { risks: Risk[] };
        if (!cancelled) setRisks(data.risks ?? []);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || dismissed || risks.length === 0) return null;

  const highRiskCount = risks.filter((r) => r.riskScore >= 0.85).length;

  return (
    <div
      className={cn(
        "rounded-lg border",
        highRiskCount > 0
          ? "border-rose-300 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/40"
          : "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/40",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <AlertTriangle
          className={cn(
            "h-4 w-4 shrink-0",
            highRiskCount > 0
              ? "text-rose-600 dark:text-rose-400"
              : "text-amber-600 dark:text-amber-400",
          )}
        />
        <span
          className={cn(
            "text-sm font-medium",
            highRiskCount > 0
              ? "text-rose-900 dark:text-rose-200"
              : "text-amber-900 dark:text-amber-200",
          )}
        >
          {risks.length} ticket{risks.length > 1 ? "s" : ""} à risque SLA
          {highRiskCount > 0 &&
            ` · ${highRiskCount} critique${highRiskCount > 1 ? "s" : ""}`}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            className="rounded p-1 hover:bg-white/50 dark:hover:bg-black/20"
            aria-label="Masquer"
          >
            <X className="h-3.5 w-3.5 text-slate-500" />
          </button>
        </span>
      </button>

      {expanded && (
        <ul className="divide-y divide-amber-200/60 border-t border-amber-200/60 dark:divide-amber-900/60 dark:border-amber-900/60">
          {risks.map((r) => (
            <li key={r.ticketId}>
              <Link
                href={`/tickets/${r.ticketId}`}
                className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/40 dark:hover:bg-black/20"
              >
                <RiskPct value={r.riskScore} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                      TK-{r.ticketNumber}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {r.subject}
                    </span>
                    {r.deadlineSource === "implicit" && (
                      <span
                        className="rounded bg-slate-200 px-1 py-px text-[9px] text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        title="Deadline inféré du SLA historique"
                      >
                        SLA implicite
                      </span>
                    )}
                  </div>
                  {r.reasons.length > 0 && (
                    <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {r.reasons[0]}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RiskPct({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 85
      ? "bg-rose-600 text-white"
      : pct >= 60
        ? "bg-amber-500 text-white"
        : "bg-slate-400 text-white";
  return (
    <span
      className={cn(
        "flex h-7 w-10 shrink-0 items-center justify-center rounded text-[11px] font-semibold tabular-nums",
        color,
      )}
    >
      {pct}%
    </span>
  );
}
