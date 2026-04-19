"use client";

// ============================================================================
// AI Close Audit — bouton + drawer "Vérifier avant fermeture".
//
// L'agent clique, l'IA évalue la qualité de la doc + propose des suivis
// préventifs. Jamais bloquant : l'agent peut toujours fermer malgré les
// warnings. Les suivis sélectionnés deviennent de vrais tickets via
// POST /api/v1/tickets/[id]/follow-ups.
// ============================================================================

import { useState } from "react";
import {
  ShieldCheck,
  Loader2,
  X,
  AlertTriangle,
  CheckCircle2,
  Plus,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FollowUpSuggestion {
  title: string;
  rationale: string;
  priority: "low" | "medium" | "high";
  dueInDays?: number;
}
interface AuditResult {
  readinessScore: number;
  verdict: "ready" | "needs_improvement" | "blocked";
  warnings: string[];
  missingFields: string[];
  followUpSuggestions: FollowUpSuggestion[];
}

const VERDICT_STYLES: Record<
  AuditResult["verdict"],
  { bg: string; border: string; text: string; label: string; Icon: typeof CheckCircle2 }
> = {
  ready: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    label: "Documentation prête",
    Icon: CheckCircle2,
  },
  needs_improvement: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    label: "Améliorations suggérées",
    Icon: AlertTriangle,
  },
  blocked: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    label: "Documentation insuffisante",
    Icon: AlertTriangle,
  },
};

export function AiCloseAudit({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [invocationId, setInvocationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFollowUps, setSelectedFollowUps] = useState<Set<number>>(
    new Set(),
  );
  const [creatingFollowUps, setCreatingFollowUps] = useState(false);
  const [followUpsCreated, setFollowUpsCreated] = useState<number | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/ai-close-audit`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data.result);
      setInvocationId(data.invocationId ?? null);
      // Par défaut on pré-sélectionne les suggestions high/medium
      const preselect = new Set<number>();
      (data.result?.followUpSuggestions ?? []).forEach(
        (f: FollowUpSuggestion, i: number) => {
          if (f.priority !== "low") preselect.add(i);
        },
      );
      setSelectedFollowUps(preselect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function recordAction(action: "accepted" | "rejected") {
    if (!invocationId) return;
    try {
      await fetch(`/api/v1/ai/invocations/${invocationId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      /* non bloquant */
    }
  }

  async function createFollowUps() {
    if (!result || selectedFollowUps.size === 0) return;
    setCreatingFollowUps(true);
    try {
      const selected = Array.from(selectedFollowUps).map(
        (i) => result.followUpSuggestions[i],
      );
      const res = await fetch(`/api/v1/tickets/${ticketId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUps: selected }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFollowUpsCreated(data.count ?? 0);
      await recordAction("accepted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setCreatingFollowUps(false);
    }
  }

  function toggleFollowUp(i: number) {
    setSelectedFollowUps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          if (!result && !loading) run();
        }}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
        Vérifier avant fermeture
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed right-0 top-0 h-screen w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                <h2 className="text-[14px] font-semibold text-slate-900">
                  Vérification avant fermeture
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="p-5 space-y-5">
              {loading && (
                <div className="flex items-center gap-2 text-[13px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyse de la documentation du ticket…
                </div>
              )}

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  {error}
                </div>
              )}

              {result && (
                <>
                  {/* Verdict global */}
                  <VerdictCard result={result} />

                  {/* Warnings */}
                  {result.warnings.length > 0 && (
                    <Section
                      icon={
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      }
                      title="Points à vérifier"
                    >
                      <ul className="list-disc list-inside space-y-1 text-[12.5px] text-slate-800">
                        {result.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Champs manquants */}
                  {result.missingFields.length > 0 && (
                    <Section title="Documentation qui aiderait la réutilisation">
                      <div className="flex flex-wrap gap-1.5">
                        {result.missingFields.map((f, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11.5px] text-slate-700"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Suivis préventifs */}
                  {result.followUpSuggestions.length > 0 && (
                    <Section
                      icon={<ListTodo className="h-3.5 w-3.5 text-blue-600" />}
                      title="Suivis préventifs suggérés"
                    >
                      {followUpsCreated != null ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">
                          <CheckCircle2 className="h-3 w-3 inline mr-1" />
                          {followUpsCreated} ticket{followUpsCreated > 1 ? "s" : ""}{" "}
                          de suivi créé{followUpsCreated > 1 ? "s" : ""}.
                        </div>
                      ) : (
                        <>
                          <p className="text-[11px] text-slate-500 mb-2">
                            Coche celles que tu veux transformer en tickets liés.
                            Ils reprendront la catégorie, le client et le
                            demandeur de ce ticket.
                          </p>
                          <ul className="space-y-1.5">
                            {result.followUpSuggestions.map((f, i) => {
                              const checked = selectedFollowUps.has(i);
                              return (
                                <li
                                  key={i}
                                  className={cn(
                                    "rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors",
                                    checked
                                      ? "border-blue-300 bg-blue-50/60"
                                      : "border-slate-200 bg-white hover:bg-slate-50",
                                  )}
                                  onClick={() => toggleFollowUp(i)}
                                >
                                  <div className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleFollowUp(i)}
                                      className="mt-0.5 h-3.5 w-3.5"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[12.5px] font-medium text-slate-900">
                                        {f.title}
                                      </p>
                                      {f.rationale && (
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                          {f.rationale}
                                        </p>
                                      )}
                                      <p className="text-[10.5px] text-slate-400 mt-0.5 flex items-center gap-2">
                                        <span>
                                          Priorité : {priorityLabel(f.priority)}
                                        </span>
                                        {f.dueInDays != null && (
                                          <span>
                                            · Échéance : {f.dueInDays} jour
                                            {f.dueInDays > 1 ? "s" : ""}
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                          <div className="mt-3 flex items-center justify-end">
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={selectedFollowUps.size === 0}
                              loading={creatingFollowUps}
                              onClick={createFollowUps}
                            >
                              <Plus className="h-3 w-3" />
                              Créer {selectedFollowUps.size} ticket
                              {selectedFollowUps.size > 1 ? "s" : ""} de suivi
                            </Button>
                          </div>
                        </>
                      )}
                    </Section>
                  )}

                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => recordAction("rejected")}
                      className="text-[11.5px] text-slate-500 hover:text-slate-800"
                    >
                      Cet audit n'est pas utile
                    </button>
                    <Button size="sm" variant="outline" onClick={run} disabled={loading}>
                      Re-vérifier
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VerdictCard({ result }: { result: AuditResult }) {
  const s = VERDICT_STYLES[result.verdict];
  const Icon = s.Icon;
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", s.bg, s.border)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", s.text)} />
        <div className="flex-1 min-w-0">
          <p className={cn("text-[13px] font-semibold", s.text)}>{s.label}</p>
          <p className={cn("text-[11px] mt-0.5", s.text)}>
            Score : {Math.round(result.readinessScore * 100)}%
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function priorityLabel(p: "low" | "medium" | "high"): string {
  return p === "high" ? "Élevée" : p === "low" ? "Faible" : "Moyenne";
}
