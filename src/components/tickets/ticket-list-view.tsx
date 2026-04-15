"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAgentAvatarsStore } from "@/stores/agent-avatars-store";
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
                <th className="px-3 py-3">
                  <button onClick={() => toggleSort("status")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Statut <SortIcon field="status" />
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button onClick={() => toggleSort("priority")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Priorité <SortIcon field="priority" />
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button onClick={() => toggleSort("assigneeName")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Assigné <SortIcon field="assigneeName" />
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button onClick={() => toggleSort("createdAt")} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.06em] hover:text-slate-700">
                    Créé <SortIcon field="createdAt" />
                  </button>
                </th>
                <th className="px-3 py-3">
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
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-slate-600 text-[12px]">
                      {ticket.organizationName}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={statusBadgeVariant[ticket.status]} className={cn("text-[11px]")}>
                        <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", statusCfg.dotClass)} />
                        {statusCfg.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={priorityBadgeVariant[ticket.priority]} className="text-[11px]">
                        <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", priorityCfg.dotClass)} />
                        {priorityCfg.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
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
                    <td className="px-3 py-3 text-[12px] text-slate-500 whitespace-nowrap tabular-nums">
                      {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
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
