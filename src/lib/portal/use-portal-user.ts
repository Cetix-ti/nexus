"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { usePortalImpersonation } from "@/stores/portal-impersonation-store";
import {
  PORTAL_ORGS,
  buildDefaultPermissions,
  type PortalOrg,
} from "@/lib/portal/org-resolver";
import { mockClientPortalPermissions } from "@/lib/projects/mock-data";
import {
  DEFAULT_VIEWER_PERMISSIONS,
  type ClientPortalPermissions,
} from "@/lib/projects/types";

export interface UsePortalUserResult {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  org: PortalOrg | null;
  organizationId: string | null;
  organizationName: string | null;
  permissions: Omit<ClientPortalPermissions, "contactId" | "organizationId">;
}

/**
 * Client-side hook that reads the current portal user from the NextAuth
 * session and resolves their org + permissions.
 *
 * Use this in any client component inside the (portal) route group.
 */
export function usePortalUser(): UsePortalUserResult {
  const { data: session, status } = useSession();
  const impersonating = usePortalImpersonation((s) => s.impersonating);

  return useMemo(() => {
    const isLoading = status === "loading";
    const isAuthenticated = status === "authenticated";

    // Impersonation takes priority over the real session
    if (impersonating) {
      const org = PORTAL_ORGS.find((o) => o.id === impersonating.organizationId) || null;
      const [first, ...rest] = impersonating.name.split(" ");
      return {
        isLoading: false,
        isAuthenticated: true,
        user: {
          id: impersonating.userId,
          name: impersonating.name,
          email: impersonating.email,
          firstName: first || "",
          lastName: rest.join(" "),
        },
        org,
        organizationId: impersonating.organizationId,
        organizationName: impersonating.organizationName,
        permissions: impersonating.permissions,
      };
    }

    if (!session?.user) {
      // Fallback to first org so the UI doesn't break in dev / before login
      const fallback = PORTAL_ORGS[0];
      return {
        isLoading,
        isAuthenticated,
        user: null,
        org: fallback,
        organizationId: fallback.id,
        organizationName: fallback.name,
        permissions: DEFAULT_VIEWER_PERMISSIONS,
      };
    }

    const u = session.user as any;
    const orgId = u.organizationId as string | undefined;
    const org = orgId
      ? PORTAL_ORGS.find((o) => o.id === orgId) || null
      : null;

    const existing = orgId
      ? mockClientPortalPermissions.find((p) => p.organizationId === orgId)
      : null;

    const perms = existing
      ? existing
      : org
      ? buildDefaultPermissions(org)
      : DEFAULT_VIEWER_PERMISSIONS;

    return {
      isLoading,
      isAuthenticated,
      user: {
        id: u.id,
        name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
        email: u.email,
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? "",
      },
      org,
      organizationId: org?.id || null,
      organizationName: u.organizationName || org?.name || null,
      permissions: perms as Omit<
        ClientPortalPermissions,
        "contactId" | "organizationId"
      >,
    };
  }, [session, status, impersonating]);
}
