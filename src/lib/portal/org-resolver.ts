// ============================================================================
// PORTAL ORG RESOLVER
// Maps an authenticated user (typically by email domain or Azure tenantId)
// to the correct client organization for the unified portal experience.
// ============================================================================

import {
  DEFAULT_VIEWER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  type ClientPortalPermissions,
} from "@/lib/projects/types";

export interface PortalOrg {
  id: string;
  name: string;
  slug: string;
  // Domains that resolve to this org (used for auto-provisioning)
  emailDomains: string[];
  // Microsoft Azure tenant id (used when signing in with MS)
  azureTenantId?: string;
  // Branding
  logoUrl?: string;
  primaryColor: string;
  accentGradient: string;
  // Default role assignment when a new user is auto-provisioned
  defaultRole: ClientPortalPermissions["portalRole"];
}

/**
 * Catalogue des organisations clientes connues du portail.
 * En production, ce mapping vit dans la base de données et est géré
 * via Settings → Accès portail client.
 */
export const PORTAL_ORGS: PortalOrg[] = [
  {
    id: "org_acme",
    name: "Acme Corp",
    slug: "acme",
    emailDomains: ["acme.com", "acmecorp.com", "acme-corp.com"],
    azureTenantId: "11111111-aaaa-bbbb-cccc-111111111111",
    primaryColor: "#2563EB",
    accentGradient: "from-blue-500 to-indigo-600",
    defaultRole: "viewer",
  },
  {
    id: "org_techstart",
    name: "TechStart Inc",
    slug: "techstart",
    emailDomains: ["techstart.io", "techstart.com"],
    azureTenantId: "22222222-aaaa-bbbb-cccc-222222222222",
    primaryColor: "#10B981",
    accentGradient: "from-emerald-500 to-teal-600",
    defaultRole: "viewer",
  },
  {
    id: "org_global",
    name: "Global Finance",
    slug: "global-finance",
    emailDomains: ["globalfinance.ca", "global-finance.ca"],
    azureTenantId: "33333333-aaaa-bbbb-cccc-333333333333",
    primaryColor: "#7C3AED",
    accentGradient: "from-violet-500 to-purple-600",
    defaultRole: "manager",
  },
  {
    id: "org_health",
    name: "HealthCare Plus",
    slug: "healthcare-plus",
    emailDomains: ["healthcareplus.ca", "healthcare-plus.ca"],
    azureTenantId: "44444444-aaaa-bbbb-cccc-444444444444",
    primaryColor: "#DC2626",
    accentGradient: "from-rose-500 to-red-600",
    defaultRole: "viewer",
  },
  {
    id: "org_media",
    name: "MédiaCentre QC",
    slug: "mediacentre-qc",
    emailDomains: ["mediacentre.qc.ca", "mediaqc.ca"],
    azureTenantId: "55555555-aaaa-bbbb-cccc-555555555555",
    primaryColor: "#06B6D4",
    accentGradient: "from-cyan-500 to-blue-600",
    defaultRole: "viewer",
  },
];

/**
 * Resolve an organization from an email address by matching the domain.
 */
export function resolveOrgByEmail(email?: string): PortalOrg | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return (
    PORTAL_ORGS.find((o) =>
      o.emailDomains.some((d) => d.toLowerCase() === domain)
    ) || null
  );
}

/**
 * Resolve an organization from a Microsoft Azure tenant id.
 * Used after a "Connect with Microsoft" sign-in.
 */
export function resolveOrgByAzureTenant(tenantId?: string): PortalOrg | null {
  if (!tenantId) return null;
  return PORTAL_ORGS.find((o) => o.azureTenantId === tenantId) || null;
}

/**
 * Build a permission set for a user based on their org's default role.
 */
export function buildDefaultPermissions(
  org: PortalOrg
): Omit<ClientPortalPermissions, "contactId" | "organizationId"> {
  switch (org.defaultRole) {
    case "admin":
      return DEFAULT_ADMIN_PERMISSIONS;
    case "manager":
      return DEFAULT_MANAGER_PERMISSIONS;
    case "viewer":
    default:
      return DEFAULT_VIEWER_PERMISSIONS;
  }
}

/**
 * Server-side helper to provision a new portal user from a Microsoft sign-in.
 * In a real app this would create a Contact + permissions record in DB.
 * Here we just return the resolved org and permission set.
 */
export interface ProvisioningResult {
  org: PortalOrg;
  permissions: Omit<ClientPortalPermissions, "contactId" | "organizationId">;
  isNew: boolean;
  message: string;
}

export function provisionPortalUser(
  email: string,
  azureTenantId?: string
): ProvisioningResult | null {
  // Try Azure tenant first (more reliable than email domain)
  let org = resolveOrgByAzureTenant(azureTenantId);
  if (!org) {
    org = resolveOrgByEmail(email);
  }
  if (!org) {
    return null;
  }
  return {
    org,
    permissions: buildDefaultPermissions(org),
    isNew: true,
    message: `Utilisateur ${email} associé à ${org.name} avec le rôle ${org.defaultRole}`,
  };
}
