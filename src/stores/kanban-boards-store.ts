"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { KanbanColumn } from "@/stores/kanban-store";

// Default columns shared across boards (re-uses kanban-store defaults)
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
    id: "col_waiting",
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

// ----------------------------------------------------------------------------
// BOARD SHARING
// ----------------------------------------------------------------------------
export type BoardShareScope =
  | "private" // owner only
  | "team" // a specific group of agents
  | "everyone"; // all agents in the tenant

export const SHARE_SCOPE_LABELS: Record<BoardShareScope, string> = {
  private: "Privé",
  team: "Équipe",
  everyone: "Tout le monde",
};

// ----------------------------------------------------------------------------
// COLUMN GROUPING
// ----------------------------------------------------------------------------
export type BoardGroupBy =
  | "status"
  | "organization"
  | "priority"
  | "sla"
  | "assignee"
  | "category"
  | "ticket_type";

export const GROUP_BY_LABELS: Record<BoardGroupBy, string> = {
  status: "Statut du ticket",
  organization: "Entreprise cliente",
  priority: "Priorité",
  sla: "Niveau de SLA",
  assignee: "Technicien assigné",
  category: "Catégorie",
  ticket_type: "Type de ticket",
};

export interface BoardColumn {
  id: string;
  label: string;
  value: string; // matching key for the groupBy (e.g. "in_progress", "org-1", "high")
  color: string; // hex
  order: number;
  visible: boolean;
}

// ----------------------------------------------------------------------------
// BOARD MODEL
// ----------------------------------------------------------------------------
export interface KanbanBoard {
  groupBy?: BoardGroupBy; // defaults to "status"
  customColumns?: BoardColumn[]; // when set, used instead of legacy columns
  id: string;
  name: string;
  description?: string;
  icon: string; // emoji
  color: string; // hex
  // Filters baked into the board (applied automatically)
  filterOrgIds: string[];
  filterTechIds: string[];
  filterCategories: string[];
  filterTags: string[];
  filterPriorities: string[];
  filterTicketTypes: string[];
  // Columns config
  columns: KanbanColumn[];
  // Sharing
  ownerId: string;
  ownerName: string;
  shareScope: BoardShareScope;
  sharedWithGroupIds: string[]; // group ids when scope === "team"
  sharedWithGroupNames: string[];
  // Pinning
  isPinned: boolean;
  // Audit
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_BOARDS: KanbanBoard[] = [
  {
    id: "board_default",
    name: "Vue générale",
    description: "Tableau Kanban principal — tous les tickets",
    icon: "📋",
    color: "#3B82F6",
    filterOrgIds: [],
    filterTechIds: [],
    filterCategories: [],
    filterTags: [],
    filterPriorities: [],
    filterTicketTypes: [],
    columns: DEFAULT_COLUMNS,
    ownerId: "system",
    ownerName: "Système",
    shareScope: "everyone",
    sharedWithGroupIds: [],
    sharedWithGroupNames: [],
    isPinned: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "board_security",
    name: "Cybersécurité",
    description: "Tickets sécurité, incidents, MFA, phishing",
    icon: "🛡️",
    color: "#DC2626",
    filterOrgIds: [],
    filterTechIds: [],
    filterCategories: ["Sécurité", "Compte & Accès"],
    filterTags: ["sécurité", "phishing", "incident"],
    filterPriorities: [],
    filterTicketTypes: [],
    columns: DEFAULT_COLUMNS,
    ownerId: "system",
    ownerName: "Système",
    shareScope: "team",
    sharedWithGroupIds: ["g_security"],
    sharedWithGroupNames: ["Équipe sécurité"],
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "board_support",
    name: "Support technique",
    description: "Niveau 1 et 2 — utilisateurs finaux",
    icon: "🎧",
    color: "#10B981",
    filterOrgIds: [],
    filterTechIds: [],
    filterCategories: ["Matériel", "Logiciels", "Email"],
    filterTags: [],
    filterPriorities: [],
    filterTicketTypes: ["incident", "service_request"],
    columns: DEFAULT_COLUMNS,
    ownerId: "system",
    ownerName: "Système",
    shareScope: "everyone",
    sharedWithGroupIds: [],
    sharedWithGroupNames: [],
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "board_sysadmin",
    name: "Sysadmin / Infrastructure",
    description: "Serveurs, réseau, virtualisation, backups",
    icon: "🖥️",
    color: "#7C3AED",
    filterOrgIds: [],
    filterTechIds: [],
    filterCategories: ["Réseau & VPN", "Infrastructure"],
    filterTags: ["serveurs", "réseau", "vpn", "backup"],
    filterPriorities: ["high", "critical"],
    filterTicketTypes: [],
    columns: DEFAULT_COLUMNS,
    ownerId: "system",
    ownerName: "Système",
    shareScope: "team",
    sharedWithGroupIds: ["g_infra"],
    sharedWithGroupNames: ["Équipe infrastructure"],
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ----------------------------------------------------------------------------
// STORE — API-backed
// ----------------------------------------------------------------------------
interface KanbanBoardsState {
  boards: KanbanBoard[];
  activeBoardId: string;
  loaded: boolean;
  loadAll: () => Promise<void>;
  setActiveBoard: (id: string) => void;
  addBoard: (b: Omit<KanbanBoard, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateBoard: (id: string, patch: Partial<KanbanBoard>) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
  duplicateBoard: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  resetBoards: () => void;
}

export const useKanbanBoardsStore = create<KanbanBoardsState>()(
  persist(
    (set, get) => ({
      boards: DEFAULT_BOARDS,
      activeBoardId: "board_default",
      loaded: false,
      loadAll: async () => {
        try {
          const res = await fetch("/api/v1/kanban-boards");
          const data = (await res.json()) as KanbanBoard[];
          if (Array.isArray(data) && data.length > 0) {
            set({
              boards: data,
              loaded: true,
              activeBoardId: data.find((b) => b.isPinned)?.id || data[0].id,
            });
          } else {
            set({ loaded: true });
          }
        } catch (e) {
          console.error("Boards load failed", e);
        }
      },
      setActiveBoard: (id) => set({ activeBoardId: id }),
      addBoard: async (b) => {
        try {
          const res = await fetch("/api/v1/kanban-boards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(b),
          });
          if (!res.ok) throw new Error("Erreur lors de la création du board");
          const created = (await res.json()) as KanbanBoard;
          set({ boards: [...get().boards, created], activeBoardId: created.id });
        } catch (err) {
          console.error("addBoard failed", err);
        }
      },
      updateBoard: async (id, patch) => {
        try {
          const res = await fetch(`/api/v1/kanban-boards/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (!res.ok) throw new Error("Erreur lors de la mise à jour du board");
          const updated = (await res.json()) as KanbanBoard;
          set({
            boards: get().boards.map((b) => (b.id === id ? updated : b)),
          });
        } catch (err) {
          console.error("updateBoard failed", err);
        }
      },
      deleteBoard: async (id) => {
        try {
          const res = await fetch(`/api/v1/kanban-boards/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Erreur lors de la suppression du board");
          const next = get().boards.filter((b) => b.id !== id);
          set({
            boards: next,
            activeBoardId:
              get().activeBoardId === id
                ? next[0]?.id || "board_default"
                : get().activeBoardId,
          });
        } catch (err) {
          console.error("deleteBoard failed", err);
        }
      },
      duplicateBoard: async (id) => {
        const src = get().boards.find((b) => b.id === id);
        if (!src) return;
        const { id: _, createdAt: _c, updatedAt: _u, ...rest } = src;
        await get().addBoard({ ...rest, name: `${src.name} (copie)`, isPinned: false });
      },
      togglePin: async (id) => {
        const board = get().boards.find((b) => b.id === id);
        if (!board) return;
        await get().updateBoard(id, { isPinned: !board.isPinned });
      },
      resetBoards: () =>
        set({ boards: DEFAULT_BOARDS, activeBoardId: "board_default", loaded: false }),
    }),
    {
      name: "nexus-kanban-boards",
      version: 1,
    }
  )
);
