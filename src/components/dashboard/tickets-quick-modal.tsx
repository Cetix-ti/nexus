"use client";

// ============================================================================
// TicketsQuickModal — liste rapide de tickets filtrée (ouverte via les tuiles
// KPI du tableau de bord).
//
// Reçoit un filtre (unassignedOnly / overdueOnly / openOnly) et fetch les
// tickets correspondants depuis /api/v1/tickets. Chaque ligne est cliquable
// → redirige vers la fiche du ticket. "Voir tous les tickets" ferme le modal
// et navigue vers /tickets avec les mêmes params pour une vue complète.
//
// Responsive : plein écran sur mobile, centré sur desktop.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  Loader2,
  AlertTriangle,
  Ticket as TicketIcon,
  ExternalLink,
  User,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface UiTicket {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  organizationName: string | null;
  assigneeName: string | null;
  requesterName: string | null;
  createdAt: string;
  dueAt: string | null;
  isOverdue: boolean;
}

export type QuickFilter = "unassigned" | "overdue" | "open";

interface FilterSpec {
  label: string;
  queryParam: string;
  emptyMessage: string;
  accentClass: string;
}

const FILTERS: Record<QuickFilter, FilterSpec> = {
  unassigned: {
    label: "Tickets non assignés",
    queryParam: "unassignedOnly=true",
    emptyMessage: "Tous les tickets ont un assigné.",
    accentClass: "text-orange-600",
  },
  overdue: {
    label: "Tickets en retard",
    queryParam: "overdueOnly=true",
    emptyMessage: "Aucun ticket n'est en retard actuellement.",
    accentClass: "text-red-600",
  },
  open: {
    label: "Tickets ouverts",
    queryParam: "openOnly=true",
    emptyMessage: "Aucun ticket ouvert.",
    accentClass: "text-blue-600",
  },
};

export function TicketsQuickModal({
  open,
  filter,
  onClose,
}: {
  open: boolean;
  filter: QuickFilter | null;
  onClose: () => void;
}) {
  const [tickets, setTickets] = useState<UiTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !filter) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTickets([]);
    const spec = FILTERS[filter];
    fetch(`/api/v1/tickets?${spec.queryParam}&limit=100`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setTickets(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, filter]);

  // Fermeture via Échap.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !filter) return null;
  const spec = FILTERS[filter];
  const isEmpty = !loading && !error && tickets.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-3xl sm:max-h-[85vh] h-[90vh] sm:h-auto bg-white sm:rounded-xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-5 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {filter === "overdue" ? (
              <AlertTriangle className={cn("h-4 w-4 shrink-0", spec.accentClass)} />
            ) : filter === "unassigned" ? (
              <User className={cn("h-4 w-4 shrink-0", spec.accentClass)} />
            ) : (
              <TicketIcon className={cn("h-4 w-4 shrink-0", spec.accentClass)} />
            )}
            <h2 className="text-[15px] font-semibold text-slate-900 truncate">
              {spec.label}
            </h2>
            {!loading && !error && (
              <span className="text-[11.5px] text-slate-500 tabular-nums shrink-0">
                ({tickets.length})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {error && (
            <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </div>
          )}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <TicketIcon className="h-8 w-8 text-slate-300 mb-2" />
              <p className="text-[13px] text-slate-500">{spec.emptyMessage}</p>
            </div>
          )}
          {!loading && !error && tickets.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tickets/${t.id}`}
                    onClick={onClose}
                    className="flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          #{t.number}
                        </span>
                        {t.isOverdue && (
                          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            En retard
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] font-medium text-slate-900 mt-0.5 line-clamp-1">
                        {t.subject}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11.5px] text-slate-500 flex-wrap">
                        {t.organizationName && (
                          <span className="truncate max-w-[160px]">
                            {t.organizationName}
                          </span>
                        )}
                        {t.assigneeName ? (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[140px]">
                              {t.assigneeName}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>·</span>
                            <span className="text-orange-600 italic">
                              Non assigné
                            </span>
                          </>
                        )}
                        {t.dueAt && (
                          <>
                            <span>·</span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5",
                                t.isOverdue && "text-red-600 font-semibold",
                              )}
                            >
                              <Clock className="h-2.5 w-2.5" />
                              {new Date(t.dueAt).toLocaleDateString("fr-CA", {
                                day: "2-digit",
                                month: "short",
                              })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-1" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — lien vers la vue complète */}
        {!loading && !error && tickets.length > 0 && (
          <div className="border-t border-slate-200 px-4 sm:px-5 py-3 shrink-0 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                window.location.href = `/tickets?${spec.queryParam}`;
              }}
            >
              Voir tous les tickets
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
