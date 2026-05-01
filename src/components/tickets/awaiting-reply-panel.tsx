"use client";

// ============================================================================
// AwaitingReplyPanel — bandeau collapsible en haut du Kanban tickets.
//
// Affiche les tickets ouverts dont la dernière communication vient du
// contact (réponse client non lue par un agent). Chaque item a un bouton
// "Marquer comme vu" qui retire le ticket de la liste sans avoir besoin
// de commenter. Cliquer sur un item ouvre le ticket.
//
// Auto-retrait : quand un agent commente un ticket, le serveur set
// lastClientReplyAcknowledgedAt = now → le ticket disparaît au prochain
// refresh (toutes les 30s OU au focus de la fenêtre).
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, MessageSquareText, Check, Loader2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface AwaitingTicket {
  id: string;
  number: number;
  displayNumber: string;
  subject: string;
  status: string;
  priority: string;
  organizationName: string;
  organizationSlug: string | null;
  requesterName: string | null;
  lastReplyAt: string;
  lastReplySource: string | null;
}

const STORAGE_KEY = "nexus:kanban:awaiting-reply-collapsed";

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-slate-400",
};

export function AwaitingReplyPanel() {
  const [tickets, setTickets] = useState<AwaitingTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/tickets/awaiting-reply", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setTickets(Array.isArray(d.tickets) ? d.tickets : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Poll 30s + refresh sur focus de fenêtre (cas où l'agent a commenté
    // dans un autre onglet / un autre client a répondu).
    const t = setInterval(refresh, 30_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  async function ack(id: string) {
    setAcking(id);
    try {
      await fetch(`/api/v1/tickets/${id}/acknowledge-reply`, {
        method: "POST",
        cache: "no-store",
      });
      // Optimistic remove
      setTickets((prev) => prev.filter((t) => t.id !== id));
    } finally {
      setAcking(null);
    }
  }

  if (loading) return null;
  if (tickets.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 mb-4 overflow-hidden">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-blue-50/60 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <MessageSquareText className="h-4 w-4" />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-[13.5px] font-semibold text-slate-900">
              Réponses reçues
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-blue-600 text-white text-[11px] font-semibold px-1.5">
                {tickets.length}
              </span>
            </p>
            <p className="text-[11.5px] text-slate-500">
              {tickets.length === 1
                ? "Un client a répondu sur un ticket — pas encore traité."
                : `${tickets.length} clients ont répondu — tickets pas encore traités.`}
            </p>
          </div>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-blue-200/60 bg-white">
          <ul className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 transition-colors"
              >
                <div
                  className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[t.priority] ?? "bg-slate-300")}
                  title={`Priorité ${t.priority}`}
                />
                <Link
                  href={`/tickets/${t.id}`}
                  className="flex-1 min-w-0 group"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-blue-700/80">
                      {t.displayNumber}
                    </span>
                    <span className="text-[12.5px] text-slate-500">·</span>
                    <span className="text-[12.5px] text-slate-600 truncate">
                      {t.organizationName}
                    </span>
                    {t.lastReplySource && (
                      <span
                        className={cn(
                          "text-[9.5px] uppercase tracking-wide rounded px-1.5 py-0.5",
                          t.lastReplySource === "email"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-emerald-50 text-emerald-700",
                        )}
                      >
                        {t.lastReplySource === "email" ? "Courriel" : "Portail"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] font-medium text-slate-900 truncate group-hover:text-blue-700 transition-colors">
                    {t.subject}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {t.requesterName ? `Réponse de ${t.requesterName} · ` : ""}
                    {fmtRelative(t.lastReplyAt)}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => ack(t.id)}
                  disabled={acking === t.id}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                  title="Marquer comme vu (sans répondre)"
                >
                  {acking === t.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Marquer vu
                </button>
              </li>
            ))}
          </ul>
          {tickets.length === 0 && (
            <div className="p-6 text-center text-[12.5px] text-slate-500">
              <Inbox className="h-5 w-5 mx-auto mb-1.5 text-slate-300" />
              Toutes les réponses ont été vues.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}
