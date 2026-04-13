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
      const res = await fetch("/api/v1/tickets");
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
      set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? updated : t)) }));
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
