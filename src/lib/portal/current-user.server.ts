// Server-only helpers — never import from a client component.
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { resolveOrgById, type ResolvedOrg } from "@/lib/portal/org-resolver";

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
 */
export async function getCurrentPortalUser(): Promise<PortalUserContext | null> {
  const session = await auth();
  if (!session?.user) return null;

  const u = session.user as any;
  const orgId = u.organizationId as string | undefined;
  if (!orgId) return null;

  const org = await resolveOrgById(orgId);
  if (!org) return null;

  // Find the contact + portal access record
  const email = (u.email as string).toLowerCase();
  const contact = await prisma.contact.findFirst({
    where: { organizationId: orgId, email: { equals: email, mode: "insensitive" } },
    include: { portalAccess: true },
  });

  const pa = contact?.portalAccess;

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
    organizationName: u.organizationName || org.name,
    organizationSlug: u.organizationSlug || org.slug,
    name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Utilisateur",
    email,
    portalRole: portalRole as "ADMIN" | "MANAGER" | "STANDARD",
    permissions,
    org,
  };
}
