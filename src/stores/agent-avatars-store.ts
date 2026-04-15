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
      // includeAvatar=true : sans ce flag, le endpoint /api/v1/users
      // renvoie une liste allégée sans le champ `avatar` pour garder
      // le payload petit. Résultat : toutes les cartes de ticket, listes,
      // etc. qui lisent depuis ce store voient `avatar = undefined` et
      // tombent sur les initiales dégradées.
      const res = await fetch("/api/v1/users?includeAvatar=true");
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
