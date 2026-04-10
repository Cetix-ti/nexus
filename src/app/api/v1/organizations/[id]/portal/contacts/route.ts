import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/** GET — list contacts with portal access info for an org */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contacts = await prisma.contact.findMany({
    where: { organizationId: id },
    include: { portalAccess: true },
    orderBy: [{ portalEnabled: "desc" }, { lastName: "asc" }],
  });

  return NextResponse.json(
    contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      jobTitle: c.jobTitle,
      isActive: c.isActive,
      isVIP: c.isVIP,
      portalEnabled: c.portalEnabled,
      portalStatus: c.portalStatus,
      lastPortalLoginAt: c.lastPortalLoginAt?.toISOString() ?? null,
      hasPassword: !!c.passwordHash,
      portalAccess: c.portalAccess
        ? {
            id: c.portalAccess.id,
            portalRole: c.portalAccess.portalRole,
            canAccessPortal: c.portalAccess.canAccessPortal,
            canSeeOwnTickets: c.portalAccess.canSeeOwnTickets,
            canSeeAllOrgTickets: c.portalAccess.canSeeAllOrgTickets,
            canCreateTickets: c.portalAccess.canCreateTickets,
            canSeeProjects: c.portalAccess.canSeeProjects,
            canSeeProjectDetails: c.portalAccess.canSeeProjectDetails,
            canSeeProjectTasks: c.portalAccess.canSeeProjectTasks,
            canSeeProjectLinkedTickets: c.portalAccess.canSeeProjectLinkedTickets,
            canSeeReports: c.portalAccess.canSeeReports,
            canSeeBillingReports: c.portalAccess.canSeeBillingReports,
            canSeeTimeReports: c.portalAccess.canSeeTimeReports,
            canSeeHourBankBalance: c.portalAccess.canSeeHourBankBalance,
            canSeeDocuments: c.portalAccess.canSeeDocuments,
            canSeeTeamMembers: c.portalAccess.canSeeTeamMembers,
            canSeeOwnAssets: c.portalAccess.canSeeOwnAssets,
            canSeeAllOrgAssets: c.portalAccess.canSeeAllOrgAssets,
            canManageAssets: c.portalAccess.canManageAssets,
            canManageContacts: c.portalAccess.canManageContacts,
          }
        : null,
    })),
  );
}
