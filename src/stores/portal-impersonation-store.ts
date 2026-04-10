"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ClientPortalPermissions } from "@/lib/projects/types";

export interface ImpersonatedPortalUser {
  userId: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: ClientPortalPermissions["portalRole"];
  permissions: Omit<ClientPortalPermissions, "contactId" | "organizationId">;
  // Who started the impersonation (admin email/name) — for the banner
  startedByName: string;
  startedAt: string;
}

interface PortalImpersonationState {
  impersonating: ImpersonatedPortalUser | null;
  startImpersonation: (u: ImpersonatedPortalUser) => void;
  stopImpersonation: () => void;
}

export const usePortalImpersonation = create<PortalImpersonationState>()(
  persist(
    (set) => ({
      impersonating: null,
      startImpersonation: (u) => set({ impersonating: u }),
      stopImpersonation: () => set({ impersonating: null }),
    }),
    {
      name: "nexus-portal-impersonation",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.sessionStorage : (undefined as any)
      ),
    }
  )
);
