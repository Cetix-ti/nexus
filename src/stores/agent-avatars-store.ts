"use client";

import { create } from "zustand";

interface AgentAvatarsState {
  avatars: Record<string, string | null>; // "FirstName LastName" → avatar URL
  loaded: boolean;
  load: () => Promise<void>;
}

export const useAgentAvatarsStore = create<AgentAvatarsState>()((set, get) => ({
  avatars: {},
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch("/api/v1/users");
      if (!res.ok) return;
      const data = await res.json();
      const users = Array.isArray(data) ? data : [];
      const avatars: Record<string, string | null> = {};
      for (const u of users) {
        const name = u.name || `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
        if (name) avatars[name] = u.avatar ?? null;
      }
      set({ avatars, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
