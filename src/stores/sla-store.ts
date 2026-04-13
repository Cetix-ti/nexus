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
    try {
      const res = await fetch("/api/v1/sla/global", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("Erreur lors de la mise à jour de la politique SLA globale");
    } catch (err) {
      console.error("setGlobalPolicy failed", err);
    }
  },

  setOrgPolicy: async (orgId, priority, policy) => {
    const current = get().orgOverrides[orgId] || get().globalProfile;
    const next = { ...current, [priority]: policy };
    set((s) => ({ orgOverrides: { ...s.orgOverrides, [orgId]: next } }));
    try {
      const res = await fetch(`/api/v1/sla/orgs/${orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("Erreur lors de la mise à jour de la politique SLA org");
    } catch (err) {
      console.error("setOrgPolicy failed", err);
    }
  },

  enableOrgOverride: async (orgId) => {
    if (get().orgOverrides[orgId]) return;
    const profile = { ...get().globalProfile };
    set((s) => ({ orgOverrides: { ...s.orgOverrides, [orgId]: profile } }));
    try {
      const res = await fetch(`/api/v1/sla/orgs/${orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("Erreur lors de l'activation de l'override org");
    } catch (err) {
      console.error("enableOrgOverride failed", err);
    }
  },

  removeOrgOverride: async (orgId) => {
    set((s) => {
      const next = { ...s.orgOverrides };
      delete next[orgId];
      return { orgOverrides: next };
    });
    try {
      const res = await fetch(`/api/v1/sla/orgs/${orgId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur lors de la suppression de l'override org");
    } catch (err) {
      console.error("removeOrgOverride failed", err);
    }
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
