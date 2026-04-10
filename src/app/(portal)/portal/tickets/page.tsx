"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Loader2,
  Ticket,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalTicket {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  organizationName: string;
  requesterName: string;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: "Nouveau", bg: "bg-blue-50", text: "text-blue-700" },
  open: { label: "Ouvert", bg: "bg-sky-50", text: "text-sky-700" },
  in_progress: { label: "En cours", bg: "bg-amber-50", text: "text-amber-700" },
  waiting_client: { label: "En attente", bg: "bg-violet-50", text: "text-violet-700" },
  on_site: { label: "Sur place", bg: "bg-cyan-50", text: "text-cyan-700" },
  scheduled: { label: "Planifié", bg: "bg-indigo-50", text: "text-indigo-700" },
  resolved: { label: "Résolu", bg: "bg-emerald-50", text: "text-emerald-700" },
  closed: { label: "Fermé", bg: "bg-slate-100", text: "text-slate-600" },
};

type TabKey = "all" | "open" | "in_progress" | "waiting" | "resolved";

const TABS: { key: TabKey; label: string; filter: (t: PortalTicket) => boolean }[] = [
  { key: "all", label: "Tous", filter: () => true },
  { key: "open", label: "Ouverts", filter: (t) => ["new", "open"].includes(t.status) },
  { key: "in_progress", label: "En cours", filter: (t) => ["in_progress", "on_site", "scheduled"].includes(t.status) },
  { key: "waiting", label: "En attente", filter: (t) => t.status === "waiting_client" },
  { key: "resolved", label: "Résolus", filter: (t) => ["resolved", "closed"].includes(t.status) },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

export default function PortalTicketsPage() {
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  useEffect(() => {
    fetch("/api/v1/portal/tickets")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setTickets(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const tabFilter = TABS.find((t) => t.key === activeTab)!.filter;
    return tickets.filter((t) => {
      if (!tabFilter(t)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !t.subject.toLowerCase().includes(q) &&
          !t.number.toLowerCase().includes(q) &&
          !(t.requesterName ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [tickets, activeTab, search]);

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const tab of TABS) {
      c[tab.key] = tickets.filter(tab.filter).length;
    }
    return c;
  }, [tickets]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Mes billets</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {tickets.length} billet{tickets.length > 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/portal/tickets/new"
          className="inline-flex items-center gap-2 h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouveau billet
        </Link>
      </div>

      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un billet..."
            className="h-10 w-full pl-10 pr-4 rounded-lg border border-slate-200 bg-white text-[13px] placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex items-center gap-1 border-b border-slate-200">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-[11px] tabular-nums text-slate-400">
                {tabCounts[tab.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm divide-y divide-slate-100">
          {filtered.map((t) => {
            const st = STATUS_STYLES[t.status] ?? STATUS_STYLES.open;
            return (
              <Link
                key={t.id}
                href={`/portal/tickets/${t.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-mono text-slate-400">
                      {t.number}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-medium",
                        st.bg,
                        st.text,
                      )}
                    >
                      {st.label}
                    </span>
                    {t.assigneeName && (
                      <span className="text-[11px] text-slate-400">
                        → {t.assigneeName}
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] font-medium text-slate-900 truncate">
                    {t.subject}
                  </p>
                </div>
                <div className="text-right shrink-0 text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo(t.updatedAt)}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Ticket className="h-10 w-10 mx-auto mb-3 text-slate-300" strokeWidth={1.5} />
          <p className="text-[14px] text-slate-500">
            {tickets.length === 0
              ? "Aucun billet pour le moment."
              : "Aucun résultat pour cette recherche."}
          </p>
        </div>
      )}
    </div>
  );
}
