"use client";

// ============================================================================
// /intelligence/anomalies — Dashboard des anomalies requester détectées par
// le job `requester-anomaly`. Admin filtre par sévérité, peut écarter (dismiss)
// celles qui sont des faux positifs — le pattern est supprimé et le job ne
// re-remonte qu'à la prochaine occurrence réelle.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Loader2,
  X,
  Building2,
  TicketIcon,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AffectedTicket {
  id: string;
  number: number;
  subject: string;
  createdAt: string;
}

interface Anomaly {
  contactId: string;
  contactEmail: string;
  organizationId: string;
  organizationName: string;
  severity: "low" | "medium" | "high";
  signals: string[];
  affectedTickets: AffectedTicket[];
  detectedAt: string;
}

const SEVERITY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "high", label: "Critiques" },
  { key: "medium", label: "Notables" },
  { key: "low", label: "Faibles" },
];

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/intelligence/anomalies");
      if (!res.ok) return;
      const data = (await res.json()) as { anomalies: Anomaly[] };
      setAnomalies(data.anomalies ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered =
    filter === "all"
      ? anomalies
      : anomalies.filter((a) => a.severity === filter);

  const handleDismiss = async (a: Anomaly) => {
    const key = `${a.contactId}|${a.detectedAt.slice(0, 13)}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/v1/intelligence/anomalies/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: a.contactId,
          detectedAt: a.detectedAt,
        }),
      });
      if (res.ok) void load();
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          Anomalies requester
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Demandeurs dont le comportement diffère significativement de leur
          baseline apprise. Peut indiquer une compromission de compte, un
          incident urgent ou un faux positif.
        </p>
      </header>

      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {SEVERITY_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setFilter(opt.key)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              filter === opt.key
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto px-2 text-xs text-slate-500 dark:text-slate-400">
          {filtered.length} anomalie{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm italic text-slate-400">
          Aucune anomalie correspondante.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => {
            const key = `${a.contactId}|${a.detectedAt.slice(0, 13)}`;
            return (
              <li
                key={key}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start gap-3">
                  <SeverityBadge severity={a.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {a.contactEmail}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Building2 className="h-3 w-3" />
                      <Link
                        href={`/intelligence/clients/${a.organizationId}`}
                        className="hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {a.organizationName}
                      </Link>
                      <span className="text-slate-300">·</span>
                      <Clock className="h-3 w-3" />
                      <span>{formatWhen(a.detectedAt)}</span>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {a.signals.map((s, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-700 dark:text-slate-200"
                        >
                          • {s}
                        </li>
                      ))}
                    </ul>
                    {a.affectedTickets.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                          Tickets déclencheurs :
                        </span>
                        {a.affectedTickets.map((t) => (
                          <Link
                            key={t.id}
                            href={`/tickets/${t.id}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <TicketIcon className="h-2.5 w-2.5" />
                            TK-{t.number}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busyKey === key}
                    onClick={() => handleDismiss(a)}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    title="Masquer cette anomalie (ne la reverra plus jusqu'à la prochaine occurrence)"
                  >
                    {busyKey === key ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    Écarter
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SeverityBadge({
  severity,
}: {
  severity: "low" | "medium" | "high";
}) {
  const map = {
    high: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  const label = { high: "Critique", medium: "Notable", low: "Faible" };
  return (
    <span
      className={cn(
        "shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase",
        map[severity],
      )}
    >
      {label[severity]}
    </span>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return `il y a ${mins} min`;
  if (mins < 24 * 60) return `il y a ${Math.floor(mins / 60)}h`;
  return d.toLocaleDateString("fr-CA", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
