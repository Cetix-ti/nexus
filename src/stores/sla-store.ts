"use client";

import { create } from "zustand";

export type SlaPriority = "low" | "medium" | "high" | "critical";

export interface SlaPolicy {
  firstResponseHours: number;
  resolutionHours: number;
}

export type SlaProfile = Record<SlaPriority, SlaPolicy>;

export const PRIORITY_LABELS: Record<SlaPriority, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
  critical: "Critique",
};

export const PRIORITY_ORDER: SlaPriority[] = ["low", "medium", "high", "critical"];

export const DEFAULT_SLA_PROFILE: SlaProfile = {
  low: { firstResponseHours: 8, resolutionHours: 72 },
  medium: { firstResponseHours: 4, resolutionHours: 24 },
  high: { firstResponseHours: 1, resolutionHours: 8 },
  critical: { firstResponseHours: 0.25, resolutionHours: 4 },
};

interface SlaState {
  globalProfile: SlaProfile;
  orgOverrides: Record<string, SlaProfile>;
  loaded: boolean;

  loadAll: () => Promise<void>;
  setGlobalPolicy: (priority: SlaPriority, policy: SlaPolicy) => Promise<void>;
  setOrgPolicy: (orgId: string, priority: SlaPriority, policy: SlaPolicy) => Promise<void>;
  enableOrgOverride: (orgId: string) => Promise<void>;
  removeOrgOverride: (orgId: string) => Promise<void>;
  getEffectiveProfile: (orgId?: string | null) => SlaProfile;
  getEffectivePolicy: (orgId: string | null | undefined, priority: SlaPriority) => SlaPolicy;
}

export const useSlaStore = create<SlaState>()((set, get) => ({
  globalProfile: DEFAULT_SLA_PROFILE,
  orgOverrides: {},
  loaded: false,

  loadAll: async () => {
    try {
      const res = await fetch("/api/v1/sla/global");
      if (!res.ok) throw new Error(`SLA API returned ${res.status}`);
      const profile = await res.json();
      if (!profile || typeof profile !== "object" || !("low" in profile)) {
        throw new Error("Invalid SLA profile response");
      }
      set({ globalProfile: profile, loaded: true });
    } catch (e) {
      console.error("SLA load failed", e);
      set({ loaded: true });
    }
  },

  setGlobalPolicy: async (priority, policy) => {
    const next = { ...get().globalProfile, [priority]: policy };
    set({ globalProfile: next });
    await fetch("/api/v1/sla/global", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  },

  setOrgPolicy: async (orgId, priority, policy) => {
    const current = get().orgOverrides[orgId] || get().globalProfile;
    const next = { ...current, [priority]: policy };
    set((s) => ({ orgOverrides: { ...s.orgOverrides, [orgId]: next } }));
    await fetch(`/api/v1/sla/orgs/${orgId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  },

  enableOrgOverride: async (orgId) => {
    if (get().orgOverrides[orgId]) return;
    const profile = { ...get().globalProfile };
    set((s) => ({ orgOverrides: { ...s.orgOverrides, [orgId]: profile } }));
    await fetch(`/api/v1/sla/orgs/${orgId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
  },

  removeOrgOverride: async (orgId) => {
    set((s) => {
      const next = { ...s.orgOverrides };
      delete next[orgId];
      return { orgOverrides: next };
    });
    await fetch(`/api/v1/sla/orgs/${orgId}`, { method: "DELETE" });
  },

  getEffectiveProfile: (orgId) => {
    const s = get();
    if (orgId && s.orgOverrides[orgId]) return s.orgOverrides[orgId];
    return s.globalProfile;
  },

  getEffectivePolicy: (orgId, priority) => {
    return get().getEffectiveProfile(orgId)[priority];
  },
}));
