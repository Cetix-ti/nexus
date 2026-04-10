"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { usePortalImpersonation } from "@/stores/portal-impersonation-store";

export interface PortalPermissions {
  portalRole: "standard" | "viewer" | "manager" | "admin";
  canAccessPortal: boolean;
  canSeeOwnTickets: boolean;
  canSeeAllOrgTickets: boolean;
  canCreateTickets: boolean;
  canSeeProjects: boolean;
  canSeeProjectDetails: boolean;
  canSeeProjectTasks: boolean;
  canSeeProjectLinkedTickets: boolean;
  canSeeReports: boolean;
  canSeeBillingReports: boolean;
  canSeeTimeReports: boolean;
  canSeeHourBankBalance: boolean;
  canSeeDocuments: boolean;
  canSeeTeamMembers: boolean;
  canSeeOwnAssets: boolean;
  canSeeAllOrgAssets: boolean;
  canManageAssets: boolean;
  canManageContacts: boolean;
}

const DEFAULT_PERMISSIONS: PortalPermissions = {
  portalRole: "standard",
  canAccessPortal: true,
  canSeeOwnTickets: true,
  canSeeAllOrgTickets: false,
  canCreateTickets: true,
  canSeeProjects: false,
  canSeeProjectDetails: false,
  canSeeProjectTasks: false,
  canSeeProjectLinkedTickets: false,
  canSeeReports: false,
  canSeeBillingReports: false,
  canSeeTimeReports: false,
  canSeeHourBankBalance: false,
  canSeeDocuments: false,
  canSeeTeamMembers: false,
  canSeeOwnAssets: true,
  canSeeAllOrgAssets: false,
  canManageAssets: false,
  canManageContacts: false,
};

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
  organizationId: string | null;
  organizationName: string | null;
  permissions: PortalPermissions;
}

/**
 * Client-side hook that reads the current portal user from the NextAuth
 * session. Permissions are stored in the JWT at sign-in time (from DB).
 */
export function usePortalUser(): UsePortalUserResult {
  const { data: session, status } = useSession();
  const impersonating = usePortalImpersonation((s) => s.impersonating);

  return useMemo(() => {
    const isLoading = status === "loading";
    const isAuthenticated = status === "authenticated";

    // Impersonation takes priority
    if (impersonating) {
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
        organizationId: impersonating.organizationId,
        organizationName: impersonating.organizationName,
        permissions: {
          ...DEFAULT_PERMISSIONS,
          ...(impersonating.permissions ?? {}),
        },
      };
    }

    if (!session?.user) {
      return {
        isLoading,
        isAuthenticated,
        user: null,
        organizationId: null,
        organizationName: null,
        permissions: DEFAULT_PERMISSIONS,
      };
    }

    const u = session.user as any;

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
      organizationId: u.organizationId || null,
      organizationName: u.organizationName || null,
      permissions: {
        ...DEFAULT_PERMISSIONS,
        portalRole: u.portalRole ?? "standard",
      },
    };
  }, [session, status, impersonating]);
}
