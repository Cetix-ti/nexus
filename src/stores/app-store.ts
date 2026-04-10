import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Organization context
  currentOrganizationId: string | null;
  setCurrentOrganizationId: (id: string | null) => void;

  // Theme
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  // Notifications panel
  notificationsPanelOpen: boolean;
  setNotificationsPanelOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarOpen: true,
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      // Organization context
      currentOrganizationId: null,
      setCurrentOrganizationId: (id) =>
        set({ currentOrganizationId: id }),

      // Theme
      theme: "system",
      setTheme: (theme) => set({ theme }),

      // Command palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      toggleCommandPalette: () =>
        set((state) => ({
          commandPaletteOpen: !state.commandPaletteOpen,
        })),

      // Notifications panel
      notificationsPanelOpen: false,
      setNotificationsPanelOpen: (open) =>
        set({ notificationsPanelOpen: open }),
    }),
    {
      name: "nexus-app-store",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        currentOrganizationId: state.currentOrganizationId,
        theme: state.theme,
      }),
    }
  )
);
