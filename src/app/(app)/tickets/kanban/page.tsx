"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { usePersistentState } from "@/lib/hooks/use-persistent-state";
import { useTicketsStore } from "@/stores/tickets-store";
import { useOrgLogosStore } from "@/stores/org-logos-store";
import { useAgentAvatarsStore } from "@/stores/agent-avatars-store";
import Link from "next/link";
import {
  LayoutList,
  LayoutGrid,
  Search,
  Filter,
  ChevronRight,
  Columns3,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { TicketKanbanView } from "@/components/tickets/ticket-kanban-view";
import { useSession } from "next-auth/react";
import { KanbanBoardSwitcher } from "@/components/tickets/kanban-board-switcher";
import { useKanbanBoardsStore } from "@/stores/kanban-boards-store";
import { useKanbanStore } from "@/stores/kanban-store";
import { DEFAULT_COLUMNS_BY_GROUP } from "@/components/settings/kanban-columns-editor";

const PRIORITY_OPTIONS = [
  { label: "Critique", value: "critical" },
  { label: "Élevée", value: "high" },
  { label: "Moyenne", value: "medium" },
  { label: "Faible", value: "low" },
];

export default function KanbanPage() {
  const { data: session } = useSession();
  const currentUserName = session?.user
    ? `${(session.user as any).firstName ?? ""} ${(session.user as any).lastName ?? ""}`.trim()
    : "";

  const [search, setSearch] = usePersistentState("nexus.kanban.search", "");
  const [priorityFilter, setPriorityFilter] = usePersistentState<string[]>("nexus.kanban.priority", []);
  const [orgFilter, setOrgFilter] = usePersistentState<string[]>("nexus.kanban.org", []);
  const [assigneeFilter, setAssigneeFilter] = usePersistentState<string[]>("nexus.kanban.assignee", []);
  const [hiddenColumns, setHiddenColumns] = usePersistentState<string[]>("nexus.kanban.hiddenColumns", ["resolved"]);
  const [myTicketsView, setMyTicketsView] = usePersistentState("nexus.kanban.myTickets", false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);

  const tickets = useTicketsStore((s) => s.tickets);
  const loadAll = useTicketsStore((s) => s.loadAll);
  const loaded = useTicketsStore((s) => s.loaded);
  const loadOrgLogos = useOrgLogosStore((s) => s.load);
  const loadAgentAvatars = useAgentAvatarsStore((s) => s.load);
  // Load kanban column preferences from server
  const loadKanbanFromServer = useKanbanStore((s) => s.loadFromServer);
  useEffect(() => {
    if (!loaded) loadAll();
    loadOrgLogos();
    loadAgentAvatars();
    loadKanbanFromServer();
  }, [loaded, loadAll, loadOrgLogos, loadAgentAvatars, loadKanbanFromServer]);

  // Dynamic filter options from actual ticket data
  const orgOptions = useMemo(() => {
    const names = new Set(tickets.map((t) => t.organizationName));
    return Array.from(names).sort().map((n) => ({ label: n, value: n }));
  }, [tickets]);

  const assigneeOptions = useMemo(() => {
    const names = new Set<string>();
    let hasUnassigned = false;
    for (const t of tickets) {
      if (t.assigneeName) names.add(t.assigneeName);
      else hasUnassigned = true;
    }
    const opts = Array.from(names).sort().map((n) => ({ label: n, value: n }));
    if (hasUnassigned) opts.unshift({ label: "Non assignés", value: "__unassigned__" });
    return opts;
  }, [tickets]);

  // Active board filters (baked-in by the board template)
  const boards = useKanbanBoardsStore((s) => s.boards);
  const activeBoardId = useKanbanBoardsStore((s) => s.activeBoardId);
  const activeBoard = boards.find((b) => b.id === activeBoardId);

  const filtered = useMemo(() => {
    let result = [...tickets];

    // 1. Apply BOARD-level filters first (baked in by the template)
    if (activeBoard) {
      if (activeBoard.filterPriorities.length > 0) {
        result = result.filter((t) =>
          activeBoard.filterPriorities.includes(t.priority)
        );
      }
      if (activeBoard.filterCategories.length > 0) {
        result = result.filter((t) =>
          activeBoard.filterCategories.includes(t.categoryName)
        );
      }
      if (activeBoard.filterTicketTypes.length > 0) {
        result = result.filter((t) =>
          activeBoard.filterTicketTypes.includes(t.type)
        );
      }
      if (activeBoard.filterTags.length > 0) {
        result = result.filter((t) =>
          t.tags.some((tag) =>
            activeBoard.filterTags.some((bt) =>
              tag.toLowerCase().includes(bt.toLowerCase())
            )
          )
        );
      }
    }

    // 2. Apply user-level filters on top
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.number.toLowerCase().includes(q) ||
          t.requesterName.toLowerCase().includes(q) ||
          t.organizationName.toLowerCase().includes(q)
      );
    }

    if (priorityFilter.length > 0) {
      result = result.filter((t) => priorityFilter.includes(t.priority));
    }

    if (orgFilter.length > 0) {
      result = result.filter((t) => orgFilter.includes(t.organizationName));
    }

    if (assigneeFilter.length > 0) {
      result = result.filter((t) => {
        if (assigneeFilter.includes("__unassigned__") && !t.assigneeName) return true;
        return t.assigneeName && assigneeFilter.includes(t.assigneeName);
      });
    }

    // "Mes tickets" quick view: show my tickets + unassigned
    if (myTicketsView && currentUserName) {
      result = result.filter(
        (t) => !t.assigneeName || t.assigneeName === currentUserName,
      );
    }

    return result;
  }, [tickets, search, priorityFilter, orgFilter, assigneeFilter, activeBoard, myTicketsView, currentUserName]);

  const activeFiltersCount =
    priorityFilter.length + orgFilter.length + assigneeFilter.length + (search ? 1 : 0);

  function clearAllFilters() {
    setSearch("");
    setPriorityFilter([]);
    setOrgFilter([]);
    setAssigneeFilter([]);
  }

  // Stats by status (using filtered)
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    filtered.forEach((t) => {
      c[t.status] = (c[t.status] || 0) + 1;
    });
    return c;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] text-slate-500">
        <Link href="/tickets" className="hover:text-slate-900 transition-colors">
          Tickets
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-300" strokeWidth={2.5} />
        <span className="text-slate-700 font-medium">Vue Kanban</span>
      </nav>

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
              Tableau Kanban
            </h1>
            <span className="inline-flex h-6 items-center rounded-md bg-slate-100 px-2 text-[11.5px] font-semibold text-slate-600 tabular-nums ring-1 ring-inset ring-slate-200/60">
              {filtered.length}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            Visualisez et gérez vos tickets par flux de travail
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Board switcher */}
          <KanbanBoardSwitcher />

          {/* Column visibility toggle */}
          <div className="relative">
            <button
              onClick={() => setColumnMenuOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[12px] font-medium transition-colors",
                hiddenColumns.length > 0
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Colonnes
              {hiddenColumns.length > 0 && (
                <span className="ml-0.5 text-[10px] bg-amber-200 text-amber-800 rounded-full h-4 w-4 flex items-center justify-center">
                  {hiddenColumns.length}
                </span>
              )}
            </button>
            {columnMenuOpen && (
              <ColumnVisibilityMenu
                hiddenColumns={hiddenColumns}
                onToggle={(value) => {
                  setHiddenColumns((prev) =>
                    prev.includes(value)
                      ? prev.filter((v) => v !== value)
                      : [...prev, value],
                  );
                }}
                onClose={() => setColumnMenuOpen(false)}
                groupBy={activeBoard?.groupBy || "status"}
              />
            )}
          </div>

          {/* View switcher */}
          <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
            <Link
              href="/tickets"
              className="rounded-md p-2 text-slate-400 hover:text-slate-600 transition-all"
              title="Vue liste"
            >
              <LayoutList className="h-4 w-4" strokeWidth={2.25} />
            </Link>
            <button
              className="rounded-md p-2 bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/60 transition-all"
              title="Vue Kanban"
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <MultiSelect
          options={PRIORITY_OPTIONS}
          selected={priorityFilter}
          onChange={setPriorityFilter}
          placeholder="Priorité"
          width={170}
        />
        <MultiSelect
          options={orgOptions}
          selected={orgFilter}
          onChange={setOrgFilter}
          placeholder="Organisations"
          width={210}
        />
        <MultiSelect
          options={assigneeOptions}
          selected={assigneeFilter}
          onChange={setAssigneeFilter}
          placeholder="Assignés à"
          width={190}
        />
        {activeFiltersCount > 0 && (
          <button
            onClick={() => { clearAllFilters(); setMyTicketsView(false); }}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Filter className="h-3.5 w-3.5" strokeWidth={2.25} />
            Effacer
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-100 px-1 text-[10px] font-bold text-blue-700 tabular-nums">
              {activeFiltersCount}
            </span>
          </button>
        )}

        {/* Quick views — right aligned */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setMyTicketsView((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border text-[13px] font-medium transition-all duration-150",
              myTicketsView
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            Mes tickets
          </button>
        </div>
      </div>

      {/* Mini stats strip */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11.5px]">
        <StatPill label="Nouveau" count={counts.new || 0} dotClass="bg-blue-500" />
        <StatPill label="Ouvert" count={counts.open || 0} dotClass="bg-sky-500" />
        <StatPill label="En cours" count={counts.in_progress || 0} dotClass="bg-amber-500" />
        <StatPill label="Sur place" count={counts.on_site || 0} dotClass="bg-cyan-500" />
        <StatPill label="En attente" count={(counts.pending || 0) + (counts.waiting_client || 0) + (counts.waiting_vendor || 0)} dotClass="bg-violet-500" />
        <StatPill label="Planifié" count={counts.scheduled || 0} dotClass="bg-teal-500" />
        <StatPill label="Résolu" count={counts.resolved || 0} dotClass="bg-emerald-500" />
      </div>

      {/* Kanban board */}
      <TicketKanbanView tickets={filtered} hiddenColumns={hiddenColumns} />
    </div>
  );
}

function StatPill({
  label,
  count,
  dotClass,
}: {
  label: string;
  count: number;
  dotClass: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 text-slate-600">
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      <span className="font-medium">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{count}</span>
    </div>
  );
}

function ColumnVisibilityMenu({
  hiddenColumns,
  onToggle,
  onClose,
  groupBy,
}: {
  hiddenColumns: string[];
  onToggle: (value: string) => void;
  onClose: () => void;
  groupBy: string;
}) {
  const columns = DEFAULT_COLUMNS_BY_GROUP[groupBy as keyof typeof DEFAULT_COLUMNS_BY_GROUP] || DEFAULT_COLUMNS_BY_GROUP.status;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Colonnes visibles
      </p>
      {columns.map((col) => {
        const visible = !hiddenColumns.includes(col.value);
        return (
          <button
            key={col.id}
            onClick={() => onToggle(col.value)}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-[12.5px] text-left hover:bg-slate-50 transition-colors"
          >
            <div className={cn(
              "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
              visible ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
            )}>
              {visible && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
            </div>
            <span className={visible ? "text-slate-700" : "text-slate-400 line-through"}>
              {col.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
