"use client";

import { useState, useMemo, useEffect } from "react";
import { useTicketsStore } from "@/stores/tickets-store";
import Link from "next/link";
import {
  LayoutList,
  LayoutGrid,
  Search,
  Filter,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { TicketKanbanView } from "@/components/tickets/ticket-kanban-view";
import { KanbanBoardSwitcher } from "@/components/tickets/kanban-board-switcher";
import { useKanbanBoardsStore } from "@/stores/kanban-boards-store";

const ORGANIZATION_OPTIONS = [
  { label: "Cetix", value: "Cetix" },
  { label: "Acme Corp", value: "Acme Corp" },
  { label: "TechStart Inc", value: "TechStart Inc" },
  { label: "Global Finance", value: "Global Finance" },
  { label: "HealthCare Plus", value: "HealthCare Plus" },
  { label: "MédiaCentre QC", value: "MédiaCentre QC" },
];

const PRIORITY_OPTIONS = [
  { label: "Critique", value: "critical" },
  { label: "Élevée", value: "high" },
  { label: "Moyenne", value: "medium" },
  { label: "Faible", value: "low" },
];

const ASSIGNEE_OPTIONS = [
  { label: "Marie Tremblay", value: "Marie Tremblay" },
  { label: "Alexandre Dubois", value: "Alexandre Dubois" },
  { label: "Sophie Lavoie", value: "Sophie Lavoie" },
  { label: "Lucas Bergeron", value: "Lucas Bergeron" },
  { label: "Non assignés", value: "__unassigned__" },
];

export default function KanbanPage() {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [orgFilter, setOrgFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);

  const tickets = useTicketsStore((s) => s.tickets);
  const loadAll = useTicketsStore((s) => s.loadAll);
  const loaded = useTicketsStore((s) => s.loaded);
  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

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

    return result;
  }, [tickets, search, priorityFilter, orgFilter, assigneeFilter, activeBoard]);

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
      <div className="flex items-end justify-between gap-4">
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

        <div className="flex items-center gap-2">
          {/* Board switcher */}
          <KanbanBoardSwitcher />

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
        <div className="w-72">
          <Input
            placeholder="Rechercher dans les tickets..."
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
          options={ORGANIZATION_OPTIONS}
          selected={orgFilter}
          onChange={setOrgFilter}
          placeholder="Organisations"
          width={210}
        />
        <MultiSelect
          options={ASSIGNEE_OPTIONS}
          selected={assigneeFilter}
          onChange={setAssigneeFilter}
          placeholder="Assignés à"
          width={190}
        />
        {activeFiltersCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Filter className="h-3.5 w-3.5" strokeWidth={2.25} />
            Effacer
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-100 px-1 text-[10px] font-bold text-blue-700 tabular-nums">
              {activeFiltersCount}
            </span>
          </button>
        )}
      </div>

      {/* Mini stats strip */}
      <div className="flex items-center gap-3 text-[11.5px]">
        <StatPill label="Nouveau" count={counts.new || 0} dotClass="bg-blue-500" />
        <StatPill label="Ouvert" count={counts.open || 0} dotClass="bg-sky-500" />
        <StatPill label="En cours" count={counts.in_progress || 0} dotClass="bg-amber-500" />
        <StatPill label="Sur place" count={counts.on_site || 0} dotClass="bg-cyan-500" />
        <StatPill label="Attente client" count={counts.waiting_client || 0} dotClass="bg-violet-500" />
        <StatPill label="Résolu" count={counts.resolved || 0} dotClass="bg-emerald-500" />
      </div>

      {/* Kanban board */}
      <TicketKanbanView tickets={filtered} />
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
