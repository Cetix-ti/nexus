"use client";

import { create } from "zustand";

interface OrgLogosState {
  logos: Record<string, string | null>; // orgName → logo data URI or null
  loaded: boolean;
  load: () => Promise<void>;
}

export const useOrgLogosStore = create<OrgLogosState>()((set, get) => ({
  logos: {},
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch("/api/v1/organizations");
      if (!res.ok) return;
      const data = await res.json();
      const orgs = Array.isArray(data) ? data : data?.data ?? [];
      const logos: Record<string, string | null> = {};
      for (const org of orgs) {
        if (org.name) logos[org.name] = org.logo ?? null;
      }
      set({ logos, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
