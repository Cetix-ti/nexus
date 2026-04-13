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

/** Set the server-side impersonation cookie so API routes can resolve the contact */
function setImpersonationCookie(user: ImpersonatedPortalUser | null) {
  if (typeof document === "undefined") return;
  if (user) {
    const value = JSON.stringify({
      email: user.email,
      organizationId: user.organizationId,
    });
    document.cookie = `nexus-impersonate=${encodeURIComponent(value)}; path=/; max-age=86400; SameSite=Lax`;
  } else {
    document.cookie = "nexus-impersonate=; path=/; max-age=0";
  }
}

export const usePortalImpersonation = create<PortalImpersonationState>()(
  persist(
    (set) => ({
      impersonating: null,
      startImpersonation: (u) => {
        setImpersonationCookie(u);
        set({ impersonating: u });
      },
      stopImpersonation: () => {
        setImpersonationCookie(null);
        set({ impersonating: null });
      },
    }),
    {
      name: "nexus-portal-impersonation",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.sessionStorage : (undefined as any)
      ),
    }
  )
);
