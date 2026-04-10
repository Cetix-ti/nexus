import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TicketFilters, ViewMode, SavedView } from "@/types";

interface TicketState {
  // View mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Filters
  filters: TicketFilters;
  setFilters: (filters: TicketFilters) => void;
  updateFilter: <K extends keyof TicketFilters>(
    key: K,
    value: TicketFilters[K]
  ) => void;
  clearFilters: () => void;
  hasActiveFilters: () => boolean;

  // Sorting
  sortBy: string;
  sortOrder: "asc" | "desc";
  setSortBy: (field: string) => void;
  setSortOrder: (order: "asc" | "desc") => void;

  // Pagination
  page: number;
  setPage: (page: number) => void;

  // Saved views
  savedViews: SavedView[];
  addSavedView: (view: Omit<SavedView, "id">) => void;
  removeSavedView: (id: string) => void;
  applySavedView: (id: string) => void;

  // Selection (for bulk actions)
  selectedTicketIds: Set<string>;
  toggleTicketSelection: (id: string) => void;
  selectAllTickets: (ids: string[]) => void;
  clearSelection: () => void;

  // Quick preview
  previewTicketId: string | null;
  setPreviewTicketId: (id: string | null) => void;
}

const DEFAULT_FILTERS: TicketFilters = {};

export const useTicketStore = create<TicketState>()(
  persist(
    (set, get) => ({
      // View mode
      viewMode: "list",
      setViewMode: (mode) => set({ viewMode: mode }),

      // Filters
      filters: { ...DEFAULT_FILTERS },
      setFilters: (filters) => set({ filters, page: 1 }),
      updateFilter: (key, value) =>
        set((state) => ({
          filters: { ...state.filters, [key]: value },
          page: 1,
        })),
      clearFilters: () => set({ filters: { ...DEFAULT_FILTERS }, page: 1 }),
      hasActiveFilters: () => {
        const { filters } = get();
        return Object.values(filters).some((v) => {
          if (Array.isArray(v)) return v.length > 0;
          if (typeof v === "boolean") return v;
          return v !== undefined && v !== null && v !== "";
        });
      },

      // Sorting
      sortBy: "createdAt",
      sortOrder: "desc",
      setSortBy: (field) => set({ sortBy: field }),
      setSortOrder: (order) => set({ sortOrder: order }),

      // Pagination
      page: 1,
      setPage: (page) => set({ page }),

      // Saved views
      savedViews: [],
      addSavedView: (view) =>
        set((state) => ({
          savedViews: [
            ...state.savedViews,
            { ...view, id: crypto.randomUUID() },
          ],
        })),
      removeSavedView: (id) =>
        set((state) => ({
          savedViews: state.savedViews.filter((v) => v.id !== id),
        })),
      applySavedView: (id) => {
        const view = get().savedViews.find((v) => v.id === id);
        if (view) {
          set({ filters: { ...view.filters }, page: 1 });
        }
      },

      // Selection
      selectedTicketIds: new Set(),
      toggleTicketSelection: (id) =>
        set((state) => {
          const next = new Set(state.selectedTicketIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { selectedTicketIds: next };
        }),
      selectAllTickets: (ids) =>
        set({ selectedTicketIds: new Set(ids) }),
      clearSelection: () => set({ selectedTicketIds: new Set() }),

      // Quick preview
      previewTicketId: null,
      setPreviewTicketId: (id) => set({ previewTicketId: id }),
    }),
    {
      name: "nexus-ticket-store",
      partialize: (state) => ({
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        savedViews: state.savedViews,
      }),
    }
  )
);
