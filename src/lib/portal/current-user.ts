// Client-safe portal helpers — no server-only imports here.
// For server-side session reads, see ./current-user.server.ts

// These are now session-based. The hardcoded CURRENT_PORTAL_USER is removed.
// Client components should use the usePortalUser() hook instead.

/**
 * @deprecated Use usePortalUser() hook in client components
 * or getCurrentPortalUser() in server components.
 * Kept as a stub so existing imports don't break during migration.
 */
export const CURRENT_PORTAL_USER = {
  contactId: "",
  organizationId: "",
  organizationName: "",
  organizationSlug: "",
  name: "",
  email: "",
  permissions: {
    portalRole: "viewer" as const,
    contactId: "",
    organizationId: "",
    canAccessPortal: true,
    canSeeOwnTickets: true,
    canSeeAllOrganizationTickets: false,
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
  },
};

/** @deprecated Use usePortalUser().organizationId */
export function getCurrentPortalOrg(): string {
  return "";
}

/** @deprecated Use usePortalUser().permissions */
export function hasPortalPermission(_key: string): boolean {
  return false;
}
