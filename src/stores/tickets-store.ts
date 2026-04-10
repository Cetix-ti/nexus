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
      set({ tickets, loaded: true, loading: false });
    } catch (e) {
      console.error("Tickets load failed", e);
      set({ loading: false });
    }
  },

  refresh: async () => {
    set({ loaded: false });
    await get().loadAll();
  },

  updateTicket: async (id, patch) => {
    const res = await fetch(`/api/v1/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const updated = (await res.json()) as Ticket;
    set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? updated : t)) }));
  },

  deleteTicket: async (id) => {
    await fetch(`/api/v1/tickets/${id}`, { method: "DELETE" });
    set((s) => ({ tickets: s.tickets.filter((t) => t.id !== id) }));
  },

  createTicket: async (input) => {
    const res = await fetch("/api/v1/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const created = (await res.json()) as Ticket;
    set((s) => ({ tickets: [created, ...s.tickets] }));
    return created;
  },
}));
