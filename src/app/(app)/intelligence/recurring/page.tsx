"use client";

// ============================================================================
// /intelligence/recurring — Patterns récurrents détectés par
// `recurring-detector` : clusters sémantiques de tickets qui reviennent chez
// un même client sur ≥ 60 jours. Admin peut voir les sujets et tickets
// exemples, et est invité à investiguer un root-cause ou proposer une
// maintenance préventive.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Repeat,
  Building2,
  TicketIcon,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExampleTicket {
  id: string;
  number: number;
  subject: string;
  createdAt: string;
}

interface Pattern {
  patternId: string;
  organizationId: string;
  organizationName: string;
  clusterSize: number;
  spanDays: number;
  avgGapDays: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  exampleSubjects: string[];
  confidence: number;
  updatedAt: string;
  exampleTickets: ExampleTicket[];
}

export default function RecurringPatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/intelligence/recurring");
        if (!res.ok) {
          setError(res.status === 403 ? "Accès réservé" : "Erreur");
          return;
        }
        const data = (await res.json()) as { patterns: Pattern[] };
        if (!cancelled) setPatterns(data.patterns ?? []);
      } catch {
        setError("Connexion impossible");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Groupe par organization pour visualisation
  const byOrg = new Map<string, Pattern[]>();
  for (const p of patterns) {
    const list = byOrg.get(p.organizationId) ?? [];
    list.push(p);
    byOrg.set(p.organizationId, list);
  }

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <Repeat className="h-6 w-6 text-indigo-500" />
          Patterns récurrents
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Clusters de tickets sémantiquement proches qui se répètent chez un
          même client sur une fenêtre de 60+ jours. Indicateur fort d&apos;un
          problème de fond à traiter plutôt que de répéter un fix de surface.
        </p>
      </header>

      {patterns.length === 0 ? (
        <p className="py-12 text-center text-sm italic text-slate-400">
          Aucun pattern récurrent détecté. Le job tourne toutes les 12 heures.
        </p>
      ) : (
        <div className="space-y-5">
          {Array.from(byOrg.entries()).map(([orgId, orgPatterns]) => (
            <section key={orgId}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Building2 className="h-4 w-4 text-slate-500" />
                <Link
                  href={`/intelligence/clients/${orgId}`}
                  className="hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  {orgPatterns[0].organizationName}
                </Link>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {orgPatterns.length} pattern
                  {orgPatterns.length > 1 ? "s" : ""}
                </span>
              </h2>
              <ul className="space-y-2">
                {orgPatterns.map((p) => (
                  <li
                    key={p.patternId}
                    className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((e) => ({
                          ...e,
                          [p.patternId]: !e[p.patternId],
                        }))
                      }
                      className="flex w-full items-center gap-3 p-3 text-left"
                    >
                      <SizeBadge size={p.clusterSize} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-800 dark:text-slate-100">
                          {p.exampleSubjects[0] ?? "(sujets variés)"}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Calendar className="h-3 w-3" />
                          <span>{p.spanDays} jours</span>
                          {p.avgGapDays !== null && (
                            <>
                              <span className="text-slate-300">·</span>
                              <Clock className="h-3 w-3" />
                              <span>
                                toutes les ~{p.avgGapDays} jours
                              </span>
                            </>
                          )}
                          <span className="text-slate-300">·</span>
                          <span>confiance {Math.round(p.confidence * 100)}%</span>
                        </div>
                      </div>
                      {expanded[p.patternId] ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                    </button>
                    {expanded[p.patternId] && (
                      <div className="space-y-3 border-t border-slate-100 p-3 text-sm dark:border-slate-800">
                        {p.exampleSubjects.length > 1 && (
                          <div>
                            <h4 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                              Sujets types
                            </h4>
                            <ul className="list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-200">
                              {p.exampleSubjects.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {p.exampleTickets.length > 0 && (
                          <div>
                            <h4 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                              Tickets exemple
                            </h4>
                            <div className="flex flex-wrap gap-1">
                              {p.exampleTickets.map((t) => (
                                <Link
                                  key={t.id}
                                  href={`/tickets/${t.id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                  <TicketIcon className="h-2.5 w-2.5" />
                                  TK-{t.number}
                                  <span className="max-w-[200px] truncate">
                                    {t.subject}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Première détection :{" "}
                            {p.firstSeen
                              ? new Date(p.firstSeen).toLocaleDateString("fr-CA")
                              : "?"}{" "}
                            · dernière :{" "}
                            {p.lastSeen
                              ? new Date(p.lastSeen).toLocaleDateString("fr-CA")
                              : "?"}
                          </div>
                          <Link
                            href="/intelligence/maintenance"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                          >
                            <Wrench className="h-3 w-3" />
                            Voir suggestions maintenance
                          </Link>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SizeBadge({ size }: { size: number }) {
  const color =
    size >= 8
      ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
      : size >= 5
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span
      className={cn(
        "flex h-7 w-10 shrink-0 items-center justify-center rounded text-xs font-semibold tabular-nums",
        color,
      )}
      title={`${size} tickets dans le cluster`}
    >
      {size}×
    </span>
  );
}
