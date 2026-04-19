"use client";

// ============================================================================
// Settings > Système > Background jobs — visibilité sur le scheduler.
//
// Montre chaque job configuré dans `src/lib/scheduler/background-jobs.ts`
// avec son intervalle, sa dernière exécution, son statut de santé et
// ses erreurs consécutives. Indispensable pour diagnostiquer "pourquoi
// les tickets n'arrivent plus" ou "l'auto-intelligence ne tourne pas".
//
// Refresh auto toutes les 15 secondes.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Clock,
  Play,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JobRow {
  name: string;
  intervalMs: number;
  isRunning: boolean;
  lastRun: string | null;
  lastError: string | null;
  consecutiveErrors: number;
  secondsSinceLastRun: number | null;
  healthy: boolean;
}

const JOB_LABEL: Record<string, string> = {
  "email-to-ticket": "Sync courriels → tickets",
  "monitoring-alerts": "Alertes monitoring (Zabbix/Atera/…)",
  "veeam-backups": "Alertes sauvegardes Veeam",
  "security-wazuh-email": "Sécurité Wazuh (email)",
  "security-wazuh-api": "Sécurité Wazuh (API)",
  "renewal-notifications": "Notifications de renouvellement",
  "location-sync": "Sync calendrier Localisation",
  "meeting-reminders": "Rappels de rencontres",
  "ai-auto-intelligence": "Auto-intelligence IA (faits + risque)",
};

export function BackgroundJobsSection() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/jobs-status");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  async function handleRunNow(name: string) {
    if (!confirm(`Lancer le job « ${JOB_LABEL[name] ?? name} » maintenant ?`))
      return;
    setTriggering(name);
    setFlash(null);
    try {
      const res = await fetch("/api/v1/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.reason === "already_running") {
          setFlash({ tone: "err", text: "Le job est déjà en cours." });
        } else {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      } else {
        setFlash({
          tone: "ok",
          text: `Job terminé en ${(data.durationMs / 1000).toFixed(1)} s.`,
        });
        void load();
      }
    } catch (err) {
      setFlash({
        tone: "err",
        text: err instanceof Error ? err.message : "Erreur",
      });
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-slate-900 flex items-center gap-2">
          <Activity className="h-4 w-4 text-slate-700" />
          Jobs d'arrière-plan
        </h2>
        <p className="mt-1 text-[12.5px] text-slate-500">
          État en temps réel des tâches planifiées (sync email, alertes,
          auto-intelligence IA, etc.). Rafraîchi toutes les 15 s.
        </p>
      </div>

      {loading && jobs.length === 0 && (
        <div className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {flash && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-[13px]",
            flash.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          {flash.text}
        </div>
      )}

      {jobs.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                    <th className="py-2 px-3 font-semibold">Job</th>
                    <th className="hidden md:table-cell py-2 px-3 font-semibold">Intervalle</th>
                    <th className="hidden sm:table-cell py-2 px-3 font-semibold">Dernière exécution</th>
                    <th className="hidden lg:table-cell py-2 px-3 font-semibold">État</th>
                    <th className="py-2 px-3 font-semibold">Santé</th>
                    <th className="py-2 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((j) => (
                    <tr key={j.name} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3">
                        <p className="font-medium text-slate-800">
                          {JOB_LABEL[j.name] ?? j.name}
                        </p>
                        <p className="text-[10.5px] text-slate-400 font-mono">
                          {j.name}
                        </p>
                      </td>
                      <td className="hidden md:table-cell py-2 px-3 text-slate-600 tabular-nums">
                        {formatInterval(j.intervalMs)}
                      </td>
                      <td className="hidden sm:table-cell py-2 px-3 text-slate-600">
                        {j.lastRun ? (
                          <>
                            <Clock className="h-2.5 w-2.5 inline mr-0.5 text-slate-400" />
                            {formatSince(j.secondsSinceLastRun)}
                          </>
                        ) : (
                          <span className="italic text-slate-400">
                            Jamais exécuté
                          </span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell py-2 px-3">
                        {j.isRunning ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-blue-700">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            En cours
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            En attente
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {j.healthy ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            Sain
                          </span>
                        ) : j.consecutiveErrors > 0 ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[11px] font-medium",
                              j.consecutiveErrors >= 5
                                ? "text-red-700"
                                : "text-amber-700",
                            )}
                            title={j.lastError ?? "Erreur inconnue"}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {j.consecutiveErrors} échec
                            {j.consecutiveErrors > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            En retard
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunNow(j.name)}
                          disabled={j.isRunning || triggering === j.name}
                          className="h-7 text-[11px]"
                          title="Lancer le job maintenant"
                        >
                          {triggering === j.name ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          <span className="hidden sm:inline">Lancer</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste des erreurs détaillées en bas, si pertinentes */}
      {jobs.some((j) => j.lastError) && (
        <Card>
          <CardContent className="p-3">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
              Dernières erreurs
            </h3>
            <div className="space-y-1.5">
              {jobs
                .filter((j) => j.lastError)
                .map((j) => (
                  <div
                    key={j.name}
                    className="rounded-md border border-amber-200 bg-amber-50/40 px-2.5 py-1.5"
                  >
                    <p className="text-[11.5px] font-medium text-amber-900">
                      {JOB_LABEL[j.name] ?? j.name}
                    </p>
                    <p className="text-[11px] text-amber-800 font-mono break-all">
                      {j.lastError}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatInterval(ms: number): string {
  if (ms < 60_000) return `${ms / 1000} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

function formatSince(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `il y a ${seconds} s`;
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  return `il y a ${Math.floor(seconds / 3600)} h`;
}
