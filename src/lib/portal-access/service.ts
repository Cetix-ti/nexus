import prisma from "@/lib/prisma";

function flatten(u: any) {
  return {
    id: u.id,
    organizationId: u.organizationId,
    name: u.name,
    email: u.email,
    role: (u.portalRole as string).toLowerCase(),
    canAccessPortal: u.canAccessPortal,
    canSeeOwnTickets: u.canSeeOwnTickets,
    canSeeAllOrganizationTickets: u.canSeeAllOrgTickets,
    canCreateTickets: u.canCreateTickets,
    canSeeProjects: u.canSeeProjects,
    canSeeProjectDetails: u.canSeeProjectDetails,
    canSeeProjectTasks: u.canSeeProjectTasks,
    canSeeProjectLinkedTickets: u.canSeeProjectLinkedTickets,
    canSeeReports: u.canSeeReports,
    canSeeBillingReports: u.canSeeBillingReports,
    canSeeTimeReports: u.canSeeTimeReports,
    canSeeHourBankBalance: u.canSeeHourBankBalance,
    canSeeDocuments: u.canSeeDocuments,
    canSeeTeamMembers: u.canSeeTeamMembers,
    lastLoginAt: u.lastLoginAt?.toISOString(),
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listPortalUsers(orgId?: string) {
  const rows = await prisma.portalAccessUser.findMany({
    where: orgId ? { organizationId: orgId } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(flatten);
}

export async function createPortalUser(input: any) {
  const data: any = {
    organizationId: input.organizationId,
    name: input.name,
    email: input.email,
    portalRole: (input.role || "viewer").toUpperCase(),
  };
  // Map canSeeAll → canSeeAllOrgTickets etc.
  if ("canSeeAllOrganizationTickets" in input) data.canSeeAllOrgTickets = input.canSeeAllOrganizationTickets;
  for (const k of [
    "canAccessPortal",
    "canSeeOwnTickets",
    "canCreateTickets",
    "canSeeProjects",
    "canSeeProjectDetails",
    "canSeeProjectTasks",
    "canSeeProjectLinkedTickets",
    "canSeeReports",
    "canSeeBillingReports",
    "canSeeTimeReports",
    "canSeeHourBankBalance",
    "canSeeDocuments",
    "canSeeTeamMembers",
  ]) {
    if (k in input) data[k] = input[k];
  }
  const row = await prisma.portalAccessUser.create({ data });
  return flatten(row);
}

export async function updatePortalUser(id: string, patch: any) {
  const data: any = { ...patch };
  if (patch.role) {
    data.portalRole = patch.role.toUpperCase();
    delete data.role;
  }
  if ("canSeeAllOrganizationTickets" in patch) {
    data.canSeeAllOrgTickets = patch.canSeeAllOrganizationTickets;
    delete data.canSeeAllOrganizationTickets;
  }
  const row = await prisma.portalAccessUser.update({ where: { id }, data });
  return flatten(row);
}

export async function deletePortalUser(id: string) {
  await prisma.portalAccessUser.delete({ where: { id } });
}
