"use client";

import { create } from "zustand";
import type { Ticket } from "@/lib/mock-data";

interface TicketsState {
  tickets: Ticket[];
  loading: boolean;
  loaded: boolean;
  loadAll: () => Promise<void>;
  refresh: () => Promise<void>;
  updateTicket: (id: string, patch: Partial<Ticket>) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;
  createTicket: (input: Partial<Ticket> & { organizationId: string; creatorId: string }) => Promise<Ticket>;
}

export const useTicketsStore = create<TicketsState>()((set, get) => ({
  tickets: [],
  loading: false,
  loaded: false,

  loadAll: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      // Limit=500 (au lieu du 100 par défaut de l'API) pour que les vues
      // Kanban / liste aient un échantillon représentatif de toutes les
      // colonnes et pas seulement des 100 tickets les plus récents (qui se
      // retrouvent tous dans "Nouveau"). Au-delà, on compte sur des filtres
      // serveur-side pour ne pas saturer.
      const res = await fetch("/api/v1/tickets?limit=500");
      const tickets = (await res.json()) as Ticket[];
      // Replace (not append) to prevent memory accumulation
      set({ tickets, loaded: true, loading: false });
    } catch (e) {
      console.error("Tickets load failed", e);
      set({ loading: false });
    }
  },

  refresh: async () => {
    set({ loaded: false, loading: false });
    await get().loadAll();
  },

  updateTicket: async (id, patch) => {
    try {
      const res = await fetch(`/api/v1/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Erreur lors de la mise à jour du ticket");
      const updated = (await res.json()) as Ticket;
      // Si le ticket est dans le store (tickets clients), on le remplace
      // en place. Sinon (ex: ticket interne qui n'est pas chargé par
      // défaut), on l'INJECTE dans le store pour que les vues partagées
      // (kanban inline assignee, etc.) reflètent la mise à jour. Pas
      // d'effet de bord sur les listes qui filtrent par isInternal.
      set((s) => {
        const exists = s.tickets.some((t) => t.id === id);
        return {
          tickets: exists
            ? s.tickets.map((t) => (t.id === id ? updated : t))
            : [updated, ...s.tickets],
        };
      });
    } catch (err) {
      console.error("updateTicket failed", err);
    }
  },

  deleteTicket: async (id) => {
    try {
      const res = await fetch(`/api/v1/tickets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur lors de la suppression du ticket");
      set((s) => ({ tickets: s.tickets.filter((t) => t.id !== id) }));
    } catch (err) {
      console.error("deleteTicket failed", err);
    }
  },

  createTicket: async (input) => {
    try {
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Erreur lors de la création du ticket");
      const created = (await res.json()) as Ticket;
      set((s) => ({ tickets: [created, ...s.tickets] }));
      return created;
    } catch (err) {
      console.error("createTicket failed", err);
      throw err;
    }
  },
}));
