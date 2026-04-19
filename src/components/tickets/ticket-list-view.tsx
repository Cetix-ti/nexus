"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Trash2, RotateCcw, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAgentAvatarsStore } from "@/stores/agent-avatars-store";
import { useTicketsStore } from "@/stores/tickets-store";
import {
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  type Ticket,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/mock-data";

interface TicketListViewProps {
  tickets: Ticket[];
}

type SortField = "number" | "subject" | "status" | "priority" | "createdAt" | "dueAt" | "organizationName" | "assigneeName";
type SortDir = "asc" | "desc";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const statusBadgeVariant: Record<TicketStatus, "primary" | "default" | "warning" | "success" | "danger"> = {
  new: "primary",
  open: "primary",
  in_progress: "warning",
  on_site: "primary",
  pending: "warning",
  waiting_client: "default",
  waiting_vendor: "default",
  scheduled: "primary",
  resolved: "success",
  closed: "default",
  cancelled: "default",
  deleted: "danger",
};

const priorityBadgeVariant: Record<TicketPriority, "danger" | "warning" | "default" | "success"> = {
  critical: "danger",
  high: "warning",
  medium: "default",
  low: "success",
};

export function TicketListView({ tickets }: TicketListViewProps) {
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Charge les avatars d'agents pour les cartes/lignes assignées.
  const avatars = useAgentAvatarsStore((s) => s.avatars);
  const loadAvatars = useAgentAvatarsStore((s) => s.load);
  useEffect(() => { loadAvatars(); }, [loadAvatars]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sorted = [...tickets].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "createdAt" || sortField === "dueAt") {
      const aTime = a[sortField] ? new Date(a[sortField] as string).getTime() : 0;
      const bTime = b[sortField] ? new Date(b[sortField] as string).getTime() : 0;
      return (aTime - bTime) * dir;
    }
    const aVal = a[sortField] ?? "";
    const bVal = b[sortField] ?? "";
    if (aVal < bVal) return -1 * dir;
    if (aVal > bVal) return 1 * dir;
    return 0;
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === tickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map((t) => t.id)));
    }
  }

  // Bulk ops — soft-delete ou restauration selon le contexte.
  // Si TOUS les tickets sélectionnés sont déjà DELETED → opération
  // "restore". Sinon → "delete" (corbeille).
  const [bulkBusy, setBulkBusy] = useState(false);
  const refreshTickets = useTicketsStore((s) => s.refresh);
  const selectedTickets = tickets.filter((t) => selectedIds.has(t.id));
  const allSelectedDeleted =
    selectedTickets.length > 0 &&
    selectedTickets.every((t) => t.status === "deleted");

  async function bulkOp(op: "delete" | "restore") {
    if (selectedIds.size === 0 || bulkBusy) return;
    const ids = Array.from(selectedIds);
    const label = op === "delete" ? "Supprimer" : "Restaurer";
    const count = ids.length;
    const msg =
      op === "delete"
        ? `${label} ${count} ticket${count > 1 ? "s" : ""} ? Ils seront déplacés dans la corbeille (récupérables).`
        : `${label} ${count} ticket${count > 1 ? "s" : ""} depuis la corbeille ?`;
    if (!window.confirm(msg)) return;

    setBulkBusy(true);
    try {
      const res = await fetch("/api/v1/tickets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setSelectedIds(new Set());
      // Reload tickets (l'appel store.refresh re-fetch /api/v1/tickets)
      await refreshTickets();
    } catch (e) {
      alert(
        `Erreur : ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
    );
  }

  return (
    <>
      {/* Barre d'action flottante — apparaît dès qu'un ticket est
          sélectionné. Affiche le compteur + bouton contextuel
          (Supprimer si tickets actifs, Restaurer si ils sont déjà
          dans la corbeille). Position fixed bottom + sticky sur
          mobile pour ne pas couvrir le contenu. */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.3)]">
          <span className="text-[13px] font-medium text-slate-700">
            {selectedIds.size} ticket{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="h-4 w-px bg-slate-200" />
          {allSelectedDeleted ? (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => bulkOp("restore")}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Restaurer
            </button>
          ) : (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => bulkOp("delete")}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Supprimer
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-slate-500 hover:bg-slate-100"
            title="Annuler la sélection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Mobile card layout */}
      <div className="md:hidden space-y-2">
        {sorted.map((ticket) => {
          const statusCfg = STATUS_CONFIG[ticket.status];
          const priorityCfg = PRIORITY_CONFIG[ticket.priority];

          return (
            <div
              key={ticket.id}
              onClick={() => router.push(`/tickets/${ticket.id}`)}
              className="cursor-pointer rounded-xl border border-slate-200/80 bg-white p-3.5 active:bg-slate-50 transition-colors shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] font-medium text-slate-400 tabular-nums shrink-0">#{ticket.number}</span>
                    <Badge variant={priorityBadgeVariant[ticket.priority]} className="text-[10px] shrink-0">
                      <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", priorityCfg.dotClass)} />
                      {priorityCfg.label}
                    </Badge>
                  </div>
                  <p className="text-[13px] font-medium text-slate-900 leading-snug line-clamp-2">
                    {ticket.subject}
                  </p>
                </div>
                <Badge variant={statusBadgeVariant[ticket.status]} className="text-[10px] shrink-0 mt-0.5">
                  <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", statusCfg.dotClass)} />
                  {statusCfg.label}
                </Badge>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                <span>{ticket.requesterName}</span>
                <span className="text-slate-200">·</span>
                <span className="tabular-nums">{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                {ticket.isOverdue && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="flex items-center gap-0.5 text-red-500 font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      En retard
                    </span>
                  </>
                )}
              </div>
              {ticket.assigneeName && (
                <div className="mt-2 flex items-center gap-1.5">
                  {avatars[ticket.assigneeName] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatars[ticket.assigneeName]!}
                      alt={ticket.assigneeName}
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[8px] font-semibold">
                      {getInitials(ticket.assigneeName)}
                    </div>
                  )}
                  <span className="text-[11px] text-slate-500">{ticket.assigneeName}</span>
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-16 text-center text-slate-400 text-[13px]">
            Aucun ticket ne correspond aux filtres.
          </div>
        )}
      </div>

      {/* Desktop table layout */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/60">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === tickets.length && tickets.length > 0}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="w-24 px-3 py-3">
                  <button onClick={() => toggleSort("number")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    # <SortIcon field="number" />
                  </button>
                </th>
                <th className="min-w-[280px] px-3 py-3">
                  <button onClick={() => toggleSort("subject")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Sujet <SortIcon field="subject" />
                  </button>
                </th>
                <th className="hidden lg:table-cell px-3 py-3">
                  <button onClick={() => toggleSort("organizationName")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Organisation <SortIcon field="organizationName" />
                  </button>
                </th>
                <th className="hidden sm:table-cell px-3 py-3">
                  <button onClick={() => toggleSort("status")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Statut <SortIcon field="status" />
                  </button>
                </th>
                <th className="hidden md:table-cell px-3 py-3">
                  <button onClick={() => toggleSort("priority")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Priorité <SortIcon field="priority" />
                  </button>
                </th>
                <th className="hidden lg:table-cell px-3 py-3">
                  <button onClick={() => toggleSort("assigneeName")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Assigné <SortIcon field="assigneeName" />
                  </button>
                </th>
                <th className="hidden xl:table-cell px-3 py-3">
                  <button onClick={() => toggleSort("createdAt")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Créé <SortIcon field="createdAt" />
                  </button>
                </th>
                <th className="hidden xl:table-cell px-3 py-3">
                  <button onClick={() => toggleSort("dueAt")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Échéance <SortIcon field="dueAt" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((ticket) => {
                const statusCfg = STATUS_CONFIG[ticket.status];
                const priorityCfg = PRIORITY_CONFIG[ticket.priority];
                const isSelected = selectedIds.has(ticket.id);

                return (
                  <tr
                    key={ticket.id}
                    onClick={() => router.push(`/tickets/${ticket.id}`)}
                    className={cn(
                      "cursor-pointer border-b border-slate-100 last:border-0 transition-colors duration-100 group",
                      isSelected ? "bg-blue-50/40" : "hover:bg-slate-50/80"
                    )}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(ticket.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-[11px] font-medium text-slate-400 tabular-nums">#{ticket.number}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div>
                        <span className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                          {ticket.subject}
                        </span>
                        <p className="mt-0.5 text-[11.5px] text-slate-400">{ticket.requesterName}</p>
                        {/* Sur mobile, on affiche les badges essentiels (statut + priorité)
                            en dessous du sujet puisque leurs colonnes dédiées sont cachées. */}
                        <div className="sm:hidden mt-1 flex items-center gap-1.5 flex-wrap">
                          <Badge variant={statusBadgeVariant[ticket.status]} className="text-[10px] py-0">
                            <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", statusCfg.dotClass)} />
                            {statusCfg.label}
                          </Badge>
                          <Badge variant={priorityBadgeVariant[ticket.priority]} className="text-[10px] py-0">
                            {priorityCfg.label}
                          </Badge>
                          {ticket.assigneeName && (
                            <span className="text-[10.5px] text-slate-500 truncate max-w-[100px]">
                              · {ticket.assigneeName}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-slate-600 text-[12px]">
                      {ticket.organizationName}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3">
                      <Badge variant={statusBadgeVariant[ticket.status]} className={cn("text-[11px]")}>
                        <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", statusCfg.dotClass)} />
                        {statusCfg.label}
                      </Badge>
                    </td>
                    <td className="hidden md:table-cell px-3 py-3">
                      <Badge variant={priorityBadgeVariant[ticket.priority]} className="text-[11px]">
                        <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", priorityCfg.dotClass)} />
                        {priorityCfg.label}
                      </Badge>
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3">
                      {ticket.assigneeName ? (
                        <div className="flex items-center gap-2">
                          {avatars[ticket.assigneeName] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatars[ticket.assigneeName]!}
                              alt={ticket.assigneeName}
                              className="h-6 w-6 rounded-full object-cover ring-2 ring-white shadow-sm"
                            />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[9px] font-semibold ring-2 ring-white shadow-sm">
                              {getInitials(ticket.assigneeName)}
                            </div>
                          )}
                          <span className="text-[12px] text-slate-700 whitespace-nowrap">{ticket.assigneeName}</span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-slate-400 italic">Non assigné</span>
                      )}
                    </td>
                    <td className="hidden xl:table-cell px-3 py-3 text-[12px] text-slate-500 whitespace-nowrap tabular-nums">
                      {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                    </td>
                    <td className="hidden xl:table-cell px-3 py-3 whitespace-nowrap">
                      {ticket.dueAt ? (
                        <div className="flex items-center gap-1">
                          {ticket.isOverdue && <AlertTriangle className="h-3 w-3 text-red-500" />}
                          <span className={cn("text-[12px] tabular-nums", ticket.isOverdue ? "text-red-600 font-semibold" : "text-slate-500")}>
                            {format(new Date(ticket.dueAt), "d MMM, HH:mm")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-slate-400 text-[13px]">
                    Aucun ticket ne correspond aux filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
