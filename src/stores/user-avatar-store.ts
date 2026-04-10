"use client";

import { create } from "zustand";

interface UserAvatarState {
  avatar: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useUserAvatarStore = create<UserAvatarState>()((set, get) => ({
  avatar: null,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch("/api/v1/me");
      if (!res.ok) return;
      const data = await res.json();
      set({ avatar: data.avatar ?? null, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  refresh: async () => {
    try {
      const res = await fetch("/api/v1/me");
      if (!res.ok) return;
      const data = await res.json();
      set({ avatar: data.avatar ?? null, loaded: true });
    } catch { /* ignore */ }
  },
}));
