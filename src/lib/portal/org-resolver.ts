// ============================================================================
// PORTAL ORG RESOLVER — DB-backed
// Maps an authenticated user (by email domain) to their client organization.
// ============================================================================

import prisma from "@/lib/prisma";

export interface ResolvedOrg {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  domains: string[];
  logo: string | null;
  primaryColor: string | null;
  portalEnabled: boolean;
  portalAuthProviders: string[];
  portalDefaultRole: string | null;
}

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  domain: true,
  domains: true,
  logo: true,
  primaryColor: true,
  portalEnabled: true,
  portalAuthProviders: true,
  portalDefaultRole: true,
} as const;

/**
 * Resolve an organization from an email address by matching the domain
 * against the organization's `domain` and `domains` fields.
 */
export async function resolveOrgByEmail(
  email?: string,
): Promise<ResolvedOrg | null> {
  if (!email) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  return prisma.organization.findFirst({
    where: {
      OR: [
        { domain: { equals: domain, mode: "insensitive" } },
        { domains: { has: domain } },
      ],
    },
    select: ORG_SELECT,
  });
}

/**
 * Resolve an organization by its ID.
 */
export async function resolveOrgById(
  orgId: string,
): Promise<ResolvedOrg | null> {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: ORG_SELECT,
  });
}

/**
 * Get the default portal role for an org — always STANDARD.
 */
export function getDefaultRole(
  _org: ResolvedOrg,
): "ADMIN" | "MANAGER" | "STANDARD" {
  return "STANDARD";
}

// ---------------------------------------------------------------------------
// Backward-compat exports for code that still imports the old names
// ---------------------------------------------------------------------------

/** @deprecated Use resolveOrgByEmail instead */
export function resolveOrgByAzureTenant(_tenantId?: string) {
  // Azure tenant resolution is now handled in the signIn callback
  // via email domain matching. This stub exists to prevent import errors.
  return null;
}

/** @deprecated Not needed — permissions come from PortalAccessUser in DB */
export function buildDefaultPermissions(_org: any) {
  return {
    portalRole: "standard" as const,
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
}

// Legacy type for compatibility
export type PortalOrg = ResolvedOrg;
export const PORTAL_ORGS: PortalOrg[] = [];
