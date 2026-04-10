"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TicketStatus } from "@/lib/mock-data";

export interface KanbanColumn {
  id: string;
  status: TicketStatus;
  label: string;
  dotClass: string;       // tailwind class e.g. "bg-blue-500"
  headerBg: string;       // e.g. "bg-blue-50/60"
  headerRing: string;     // e.g. "ring-blue-200/60"
  visible: boolean;
  order: number;
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  {
    id: "col_new",
    status: "new",
    label: "Nouveau",
    dotClass: "bg-blue-500",
    headerBg: "bg-blue-50/60",
    headerRing: "ring-blue-200/60",
    visible: true,
    order: 0,
  },
  {
    id: "col_open",
    status: "open",
    label: "Ouvert",
    dotClass: "bg-sky-500",
    headerBg: "bg-sky-50/60",
    headerRing: "ring-sky-200/60",
    visible: true,
    order: 1,
  },
  {
    id: "col_in_progress",
    status: "in_progress",
    label: "En cours",
    dotClass: "bg-amber-500",
    headerBg: "bg-amber-50/60",
    headerRing: "ring-amber-200/60",
    visible: true,
    order: 2,
  },
  {
    id: "col_on_site",
    status: "on_site",
    label: "Sur place",
    dotClass: "bg-cyan-500",
    headerBg: "bg-cyan-50/60",
    headerRing: "ring-cyan-200/60",
    visible: true,
    order: 3,
  },
  {
    id: "col_waiting_client",
    status: "waiting_client",
    label: "Attente client",
    dotClass: "bg-violet-500",
    headerBg: "bg-violet-50/60",
    headerRing: "ring-violet-200/60",
    visible: true,
    order: 4,
  },
  {
    id: "col_resolved",
    status: "resolved",
    label: "Résolu",
    dotClass: "bg-emerald-500",
    headerBg: "bg-emerald-50/60",
    headerRing: "ring-emerald-200/60",
    visible: true,
    order: 5,
  },
];

interface KanbanState {
  columns: KanbanColumn[];
  addColumn: (col: Omit<KanbanColumn, "id" | "order">) => void;
  updateColumn: (id: string, patch: Partial<KanbanColumn>) => void;
  deleteColumn: (id: string) => void;
  reorderColumns: (ids: string[]) => void;
  resetColumns: () => void;
}

export const useKanbanStore = create<KanbanState>()(
  persist(
    (set, get) => ({
      columns: DEFAULT_COLUMNS,
      addColumn: (col) => {
        const columns = get().columns;
        set({
          columns: [
            ...columns,
            { ...col, id: `col_${Date.now()}`, order: columns.length },
          ],
        });
      },
      updateColumn: (id, patch) => {
        set({
          columns: get().columns.map((c) =>
            c.id === id ? { ...c, ...patch } : c
          ),
        });
      },
      deleteColumn: (id) => {
        set({ columns: get().columns.filter((c) => c.id !== id) });
      },
      reorderColumns: (ids) => {
        const map = new Map(get().columns.map((c) => [c.id, c]));
        set({
          columns: ids
            .map((id, i) => {
              const c = map.get(id);
              return c ? { ...c, order: i } : null;
            })
            .filter((c): c is KanbanColumn => c !== null),
        });
      },
      resetColumns: () => set({ columns: DEFAULT_COLUMNS }),
    }),
    {
      name: "nexus-kanban-columns",
      version: 1,
    }
  )
);

export const COLOR_PRESETS = [
  { name: "Bleu", dot: "bg-blue-500", bg: "bg-blue-50/60", ring: "ring-blue-200/60" },
  { name: "Ciel", dot: "bg-sky-500", bg: "bg-sky-50/60", ring: "ring-sky-200/60" },
  { name: "Cyan", dot: "bg-cyan-500", bg: "bg-cyan-50/60", ring: "ring-cyan-200/60" },
  { name: "Émeraude", dot: "bg-emerald-500", bg: "bg-emerald-50/60", ring: "ring-emerald-200/60" },
  { name: "Lime", dot: "bg-lime-500", bg: "bg-lime-50/60", ring: "ring-lime-200/60" },
  { name: "Ambre", dot: "bg-amber-500", bg: "bg-amber-50/60", ring: "ring-amber-200/60" },
  { name: "Orange", dot: "bg-orange-500", bg: "bg-orange-50/60", ring: "ring-orange-200/60" },
  { name: "Rouge", dot: "bg-red-500", bg: "bg-red-50/60", ring: "ring-red-200/60" },
  { name: "Rose", dot: "bg-rose-500", bg: "bg-rose-50/60", ring: "ring-rose-200/60" },
  { name: "Fuchsia", dot: "bg-fuchsia-500", bg: "bg-fuchsia-50/60", ring: "ring-fuchsia-200/60" },
  { name: "Violet", dot: "bg-violet-500", bg: "bg-violet-50/60", ring: "ring-violet-200/60" },
  { name: "Indigo", dot: "bg-indigo-500", bg: "bg-indigo-50/60", ring: "ring-indigo-200/60" },
  { name: "Slate", dot: "bg-slate-500", bg: "bg-slate-50/60", ring: "ring-slate-200/60" },
];

export const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "new", label: "Nouveau" },
  { value: "open", label: "Ouvert" },
  { value: "in_progress", label: "En cours" },
  { value: "on_site", label: "Sur place" },
  { value: "waiting_client", label: "Attente client" },
  { value: "resolved", label: "Résolu" },
  { value: "closed", label: "Fermé" },
];
