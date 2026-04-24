"use client";

// ============================================================================
// /intelligence/maintenance — Dashboard actionnable des suggestions de
// maintenance. Alimenté par le job `maintenance-suggester`.
//
// Trois groupes : ouvertes (à traiter), acceptées (déjà ticketées), rejetées
// (en cooldown 30 jours).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Wrench,
  Check,
  X,
  TicketIcon,
  Building2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggestion {
  suggestionId: string;
  organizationId: string;
  organizationName: string | null;
  basis: string;
  title: string;
  rationale: string;
  expectedBenefit: string;
  estimatedEffort: "S" | "M" | "L" | "XL";
  clientImpact: "low" | "medium" | "high";
  evidenceTicketIds: string[];
  /** Enrichi côté API avec le numéro + sujet pour affichage TK-NNNN. */
  evidenceTickets: Array<{ id: string; number: number; subject: string }>;
  assetIds: string[];
  status: "open" | "accepted" | "rejected";
  confidence: number;
  detectedAt: string;
}

interface Payload {
  open: Suggestion[];
  accepted: Suggestion[];
  rejected: Suggestion[];
}

export default function MaintenanceDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/intelligence/maintenance");
      if (!res.ok) {
        setError(res.status === 403 ? "Accès réservé aux admins" : "Erreur");
        return;
      }
      setData((await res.json()) as Payload);
    } catch {
      setError("Connexion impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReject = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/intelligence/maintenance/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      if (res.ok) {
        void load();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Erreur ${res.status} — rejet impossible`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setBusyId(null);
    }
  };

  const handleAccept = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/intelligence/maintenance/${id}/create-ticket`,
        { method: "POST" },
      );
      if (res.ok) {
        const { ticketId } = (await res.json()) as { ticketId: string };
        router.push(`/tickets/${ticketId}`);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Erreur ${res.status} — création de ticket impossible`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-600 dark:text-rose-400">{error ?? "Chargement..."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <Wrench className="h-6 w-6 text-purple-500" />
          Opportunités de maintenance
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Interventions préventives proposées automatiquement à partir des
          patterns récurrents, des actifs vieillissants et des tickets
          hotspots. Accepter crée un ticket SERVICE_REQUEST interne pré-rempli.
        </p>
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Section
        title={`À traiter (${data.open.length})`}
        suggestions={data.open}
        expanded={expanded}
        onToggle={(id) =>
          setExpanded((e) => ({ ...e, [id]: !e[id] }))
        }
        renderActions={(s) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busyId === s.suggestionId}
              onClick={() => handleAccept(s.suggestionId)}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busyId === s.suggestionId ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Créer ticket
            </button>
            <button
              type="button"
              disabled={busyId === s.suggestionId}
              onClick={() => handleReject(s.suggestionId)}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <X className="h-3 w-3" />
              Rejeter
            </button>
          </div>
        )}
      />

      {data.accepted.length > 0 && (
        <Section
          title={`Acceptées (${data.accepted.length})`}
          suggestions={data.accepted}
          expanded={expanded}
          onToggle={(id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))}
          renderActions={() => (
            <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Ticketée
            </span>
          )}
          dim
        />
      )}

      {data.rejected.length > 0 && (
        <Section
          title={`Rejetées récemment (${data.rejected.length})`}
          suggestions={data.rejected}
          expanded={expanded}
          onToggle={(id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))}
          renderActions={() => (
            <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              Rejetée · cooldown 30j
            </span>
          )}
          dim
        />
      )}
    </div>
  );
}

function Section({
  title,
  suggestions,
  expanded,
  onToggle,
  renderActions,
  dim,
}: {
  title: string;
  suggestions: Suggestion[];
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  renderActions: (s: Suggestion) => React.ReactNode;
  dim?: boolean;
}) {
  if (suggestions.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          {title}
        </h2>
        <p className="text-xs italic text-slate-400">Aucune suggestion.</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        {title}
      </h2>
      <ul className={cn("space-y-2", dim && "opacity-70")}>
        {suggestions.map((s) => (
          <li
            key={s.suggestionId}
            className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-3 p-3">
              <ImpactBadge impact={s.clientImpact} />
              <EffortBadge effort={s.estimatedEffort} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {s.title}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Building2 className="h-3 w-3" />
                  <span>{s.organizationName ?? "(organisation inconnue)"}</span>
                  <span className="text-slate-300">·</span>
                  <span>{basisLabel(s.basis)}</span>
                  {s.evidenceTicketIds.length > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>{s.evidenceTicketIds.length} ticket(s) en preuve</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {renderActions(s)}
                <button
                  type="button"
                  onClick={() => onToggle(s.suggestionId)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {expanded[s.suggestionId] ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {expanded[s.suggestionId] && (
              <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-sm dark:border-slate-800">
                <div>
                  <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Justification
                  </h4>
                  <p className="text-slate-700 dark:text-slate-200">{s.rationale}</p>
                </div>
                {s.expectedBenefit && (
                  <div>
                    <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Bénéfice attendu
                    </h4>
                    <p className="text-slate-700 dark:text-slate-200">
                      {s.expectedBenefit}
                    </p>
                  </div>
                )}
                {s.evidenceTickets.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Tickets de référence
                    </h4>
                    <ul className="flex flex-wrap gap-1">
                      {s.evidenceTickets.map((t) => (
                        <li key={t.id}>
                          <Link
                            href={`/tickets/${t.id}`}
                            title={t.subject}
                            className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <TicketIcon className="h-2.5 w-2.5" />
                            TK-{t.number}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ImpactBadge({ impact }: { impact: "low" | "medium" | "high" }) {
  const map = {
    high: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  const label = { high: "Fort", medium: "Moyen", low: "Faible" };
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
        map[impact],
      )}
    >
      {label[impact]}
    </span>
  );
}

function EffortBadge({ effort }: { effort: "S" | "M" | "L" | "XL" }) {
  return (
    <span className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300">
      {effort}
    </span>
  );
}

function basisLabel(basis: string): string {
  switch (basis) {
    case "recurring_pattern":
      return "Pattern récurrent";
    case "aging_asset":
      return "Actif vieillissant";
    case "asset_hotspot":
      return "Actif hotspot";
    default:
      return basis;
  }
}
