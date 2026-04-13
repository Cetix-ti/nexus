// Server-only helpers — never import from a client component.
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { resolveOrgById, type ResolvedOrg } from "@/lib/portal/org-resolver";
import { cookies } from "next/headers";

export interface PortalUserContext {
  contactId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  name: string;
  email: string;
  portalRole: "ADMIN" | "MANAGER" | "STANDARD";
  permissions: {
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
  };
  org: ResolvedOrg;
}

/**
 * Server-side: read the current portal user from the session,
 * then look up their real permissions from the DB.
 *
 * Supports admin impersonation: if the current user is an MSP agent
 * and the `nexus-impersonate` cookie is set, we resolve the portal
 * context as the impersonated contact instead.
 */
export async function getCurrentPortalUser(): Promise<PortalUserContext | null> {
  const session = await auth();
  if (!session?.user) return null;

  const u = session.user as any;
  let orgId = u.organizationId as string | undefined;
  let email = (u.email as string).toLowerCase();

  // IMPERSONATION: if current user is an MSP agent (no orgId), check for
  // impersonation cookie set by the portal preview feature.
  if (!orgId) {
    const role = u.role as string | undefined;
    const isAgent = role && !role.startsWith("CLIENT_");

    if (isAgent) {
      // Check for impersonation cookie
      const cookieStore = await cookies();
      const impersonateCookie = cookieStore.get("nexus-impersonate")?.value;
      if (impersonateCookie) {
        try {
          const imp = JSON.parse(impersonateCookie);
          if (imp.email && imp.organizationId) {
            orgId = imp.organizationId;
            email = imp.email.toLowerCase();
          }
        } catch {
          // Invalid cookie — ignore
        }
      }
      if (!orgId) return null; // Admin without impersonation → no portal access
    }
  }

  if (!orgId) return null;

  const org = await resolveOrgById(orgId);
  if (!org) return null;

  // SECURITY: Verify org has portal enabled
  if (!org.portalEnabled) return null;

  // Find the contact + portal access record
  const contact = await prisma.contact.findFirst({
    where: { organizationId: orgId, email: { equals: email, mode: "insensitive" } },
    include: { portalAccess: true },
  });

  // SECURITY: Block inactive contacts
  if (contact && !contact.isActive) return null;
  // SECURITY: Block contacts with portal disabled
  if (contact && !contact.portalEnabled) return null;

  const pa = contact?.portalAccess;
  // SECURITY: Block if portal access explicitly revoked
  if (pa && !pa.canAccessPortal) return null;

  // Build permissions from DB or defaults
  const permissions = {
    canAccessPortal: pa?.canAccessPortal ?? true,
    canSeeOwnTickets: pa?.canSeeOwnTickets ?? true,
    canSeeAllOrgTickets: pa?.canSeeAllOrgTickets ?? false,
    canCreateTickets: pa?.canCreateTickets ?? true,
    canSeeProjects: pa?.canSeeProjects ?? false,
    canSeeProjectDetails: pa?.canSeeProjectDetails ?? false,
    canSeeProjectTasks: pa?.canSeeProjectTasks ?? false,
    canSeeProjectLinkedTickets: pa?.canSeeProjectLinkedTickets ?? false,
    canSeeReports: pa?.canSeeReports ?? false,
    canSeeBillingReports: pa?.canSeeBillingReports ?? false,
    canSeeTimeReports: pa?.canSeeTimeReports ?? false,
    canSeeHourBankBalance: pa?.canSeeHourBankBalance ?? false,
    canSeeDocuments: pa?.canSeeDocuments ?? false,
    canSeeTeamMembers: pa?.canSeeTeamMembers ?? false,
    canSeeOwnAssets: pa?.canSeeOwnAssets ?? true,
    canSeeAllOrgAssets: pa?.canSeeAllOrgAssets ?? false,
    canManageAssets: pa?.canManageAssets ?? false,
    canManageContacts: pa?.canManageContacts ?? false,
  };

  const portalRole = pa?.portalRole ?? "STANDARD";

  return {
    contactId: contact?.id ?? `ct_${u.id}`,
    organizationId: orgId,
    organizationName: org.name,
    organizationSlug: org.slug,
    name: contact
      ? `${contact.firstName} ${contact.lastName}`.trim()
      : `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Utilisateur",
    email,
    portalRole: portalRole as "ADMIN" | "MANAGER" | "STANDARD",
    permissions,
    org,
  };
}
