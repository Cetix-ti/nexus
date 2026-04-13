"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TicketStatus } from "@/lib/mock-data";

export interface KanbanColumn {
  id: string;
  status: TicketStatus;
  label: string;
  dotClass: string;
  headerBg: string;
  headerRing: string;
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
    id: "col_pending",
    status: "pending",
    label: "En attente",
    dotClass: "bg-violet-500",
    headerBg: "bg-violet-50/60",
    headerRing: "ring-violet-200/60",
    visible: true,
    order: 4,
  },
  {
    id: "col_waiting_client",
    status: "waiting_client",
    label: "Attente client",
    dotClass: "bg-purple-500",
    headerBg: "bg-purple-50/60",
    headerRing: "ring-purple-200/60",
    visible: true,
    order: 5,
  },
  {
    id: "col_waiting_vendor",
    status: "waiting_vendor",
    label: "Attente fournisseur",
    dotClass: "bg-pink-500",
    headerBg: "bg-pink-50/60",
    headerRing: "ring-pink-200/60",
    visible: true,
    order: 6,
  },
  {
    id: "col_scheduled",
    status: "scheduled",
    label: "Planifié",
    dotClass: "bg-teal-500",
    headerBg: "bg-teal-50/60",
    headerRing: "ring-teal-200/60",
    visible: true,
    order: 7,
  },
  {
    id: "col_resolved",
    status: "resolved",
    label: "Résolu",
    dotClass: "bg-emerald-500",
    headerBg: "bg-emerald-50/60",
    headerRing: "ring-emerald-200/60",
    visible: true,
    order: 8,
  },
];

/** Save column order to user's server-side preferences */
function saveToServer(columns: KanbanColumn[]) {
  const columnOrder = columns.map((c) => ({ id: c.id, order: c.order, visible: c.visible }));
  fetch("/api/v1/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences: { kanbanColumnOrder: columnOrder } }),
  }).catch(() => {});
}

interface KanbanState {
  columns: KanbanColumn[];
  loaded: boolean;
  addColumn: (col: Omit<KanbanColumn, "id" | "order">) => void;
  updateColumn: (id: string, patch: Partial<KanbanColumn>) => void;
  deleteColumn: (id: string) => void;
  reorderColumns: (ids: string[]) => void;
  resetColumns: () => void;
  loadFromServer: () => Promise<void>;
}

export const useKanbanStore = create<KanbanState>()(
  persist(
    (set, get) => ({
      columns: DEFAULT_COLUMNS,
      loaded: false,

      loadFromServer: async () => {
        if (get().loaded) return;
        try {
          const res = await fetch("/api/v1/me");
          if (!res.ok) return;
          const user = await res.json();
          const prefs = user?.preferences?.kanbanColumnOrder;
          if (Array.isArray(prefs) && prefs.length > 0) {
            // Merge server order with current columns (in case new columns were added)
            const currentCols = get().columns;
            const orderMap = new Map(prefs.map((p: any) => [p.id, p]));
            const merged = currentCols.map((col) => {
              const saved = orderMap.get(col.id);
              if (saved) return { ...col, order: saved.order, visible: saved.visible ?? col.visible };
              return col;
            });
            merged.sort((a, b) => a.order - b.order);
            set({ columns: merged, loaded: true });
          } else {
            set({ loaded: true });
          }
        } catch {
          set({ loaded: true });
        }
      },

      addColumn: (col) => {
        const columns = get().columns;
        const updated = [
          ...columns,
          { ...col, id: `col_${Date.now()}`, order: columns.length },
        ];
        set({ columns: updated });
        saveToServer(updated);
      },
      updateColumn: (id, patch) => {
        const updated = get().columns.map((c) =>
          c.id === id ? { ...c, ...patch } : c
        );
        set({ columns: updated });
        saveToServer(updated);
      },
      deleteColumn: (id) => {
        const updated = get().columns.filter((c) => c.id !== id);
        set({ columns: updated });
        saveToServer(updated);
      },
      reorderColumns: (ids) => {
        const map = new Map(get().columns.map((c) => [c.id, c]));
        const updated = ids
          .map((id, i) => {
            const c = map.get(id);
            return c ? { ...c, order: i } : null;
          })
          .filter((c): c is KanbanColumn => c !== null);
        set({ columns: updated });
        saveToServer(updated);
      },
      resetColumns: () => {
        set({ columns: DEFAULT_COLUMNS });
        saveToServer(DEFAULT_COLUMNS);
      },
    }),
    {
      name: "nexus-kanban-columns",
      version: 2,
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
  { value: "pending", label: "En attente" },
  { value: "waiting_client", label: "Attente client" },
  { value: "waiting_vendor", label: "Attente fournisseur" },
  { value: "scheduled", label: "Planifié" },
  { value: "resolved", label: "Résolu" },
  { value: "closed", label: "Fermé" },
  { value: "cancelled", label: "Annulé" },
];
