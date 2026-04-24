"use client";

// ============================================================================
// Category Backfill — carte admin dans /intelligence.
//
// Permet de lancer le triage IA sur TOUS les tickets historiques sans
// catégorie. Enchaîne automatiquement les lots (25 par défaut) jusqu'à
// ce que `remaining=0`. Progrès visible en temps réel.
//
// Note : le triage à la création est déjà automatique — ce backfill sert
// à rattraper l'historique ET les tickets neufs qui auraient échappé au
// triage auto (timeout LLM, erreur réseau, etc.).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Play, Pause, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Stats {
  remaining: number;
  totalTickets: number;
  totalWithCategory: number;
  coveragePct: number;
}

export function CategoryBackfillCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sessionProcessed, setSessionProcessed] = useState(0);
  const [sessionErrors, setSessionErrors] = useState(0);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/ai/jobs/category-backfill");
      if (!r.ok) return;
      const d = await r.json();
      setStats(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Boucle principale : tant que running + pas pause + remaining > 0,
  // on appelle le POST avec limit=25 et on rafraîchit les stats.
  useEffect(() => {
    if (!running || paused) return;
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        try {
          const res = await fetch("/api/v1/ai/jobs/category-backfill?limit=25", {
            method: "POST",
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setLastMessage(body.error || `Erreur ${res.status}`);
            setRunning(false);
            break;
          }
          const d = (await res.json()) as {
            processed: number; errors: number; remaining: number;
            skippedExistingInvocation: number;
          };
          if (cancelled) break;
          setSessionProcessed((s) => s + d.processed);
          setSessionErrors((s) => s + d.errors);
          setStats((prev) =>
            prev ? { ...prev, remaining: d.remaining } : prev,
          );
          if (d.remaining === 0) {
            setLastMessage("Backfill terminé.");
            setRunning(false);
            break;
          }
          // Petite pause entre lots pour laisser souffler le LLM / ne pas
          // saturer le pool de connexions Prisma.
          await new Promise((r) => setTimeout(r, 800));
        } catch (err) {
          setLastMessage(err instanceof Error ? err.message : String(err));
          setRunning(false);
          break;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [running, paused]);

  function start() {
    setSessionProcessed(0);
    setSessionErrors(0);
    setLastMessage(null);
    setPaused(false);
    setRunning(true);
  }

  function stop() {
    setRunning(false);
    setPaused(false);
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <Brain className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-slate-900">
                  Catégorisation IA des tickets historiques
                </p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Lance le triage IA sur les tickets existants sans catégorie.
                  Les boutons de feedback apparaîtront sur chaque ticket traité.
                </p>
              </div>
            </div>

            {loading ? (
              <p className="mt-4 text-[12px] text-slate-400">Chargement des stats…</p>
            ) : stats ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Total tickets" value={stats.totalTickets.toLocaleString("fr-CA")} />
                  <Stat label="Avec catégorie" value={stats.totalWithCategory.toLocaleString("fr-CA")} />
                  <Stat label="Sans catégorie" value={stats.remaining.toLocaleString("fr-CA")} tone={stats.remaining > 0 ? "amber" : "emerald"} />
                  <Stat label="Couverture" value={`${stats.coveragePct}%`} tone="blue" />
                </div>

                {stats.totalTickets > 0 && (
                  <div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all"
                        style={{ width: `${stats.coveragePct}%` }}
                      />
                    </div>
                  </div>
                )}

                {running && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 text-[12px] text-blue-800">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Traitement en cours…
                    </p>
                    <p className="mt-0.5">
                      {sessionProcessed} ticket{sessionProcessed > 1 ? "s" : ""} analysé{sessionProcessed > 1 ? "s" : ""} cette session
                      {sessionErrors > 0 && (
                        <span className="text-amber-700"> · {sessionErrors} erreur{sessionErrors > 1 ? "s" : ""}</span>
                      )}
                    </p>
                  </div>
                )}

                {lastMessage && !running && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-[12px] text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {lastMessage}
                    {sessionProcessed > 0 && (
                      <span className="text-emerald-700">
                        · {sessionProcessed} ticket{sessionProcessed > 1 ? "s" : ""} traité{sessionProcessed > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {!running ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={start}
                      disabled={stats.remaining === 0}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {stats.remaining === 0 ? "Tout est catégorisé" : `Analyser ${stats.remaining} tickets`}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>
                        <Pause className="h-3.5 w-3.5" />
                        {paused ? "Reprendre" : "Pause"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={stop}>
                        Arrêter
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={loadStats} disabled={running}>
                    Rafraîchir
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" | "emerald" | "blue" }) {
  const color =
    tone === "amber" ? "text-amber-700"
    : tone === "emerald" ? "text-emerald-700"
    : tone === "blue" ? "text-blue-700"
    : "text-slate-800";
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[18px] font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
