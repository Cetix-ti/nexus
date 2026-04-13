import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

type Params = { params: Promise<{ id: string; contactId: string }> };

/** PATCH — update a contact's portal access, role, permissions, status */
export async function PATCH(req: Request, { params }: Params) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId, contactId } = await params;
  const body = await req.json();

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId: orgId },
    include: { portalAccess: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
  }

  // Update contact-level fields
  const contactData: any = {};
  if (body.portalEnabled !== undefined) contactData.portalEnabled = !!body.portalEnabled;
  if (body.portalStatus !== undefined) contactData.portalStatus = body.portalStatus;
  if (body.isActive !== undefined) contactData.isActive = !!body.isActive;
  if (body.firstName !== undefined) contactData.firstName = body.firstName;
  if (body.lastName !== undefined) contactData.lastName = body.lastName;
  if (body.email !== undefined) contactData.email = body.email;
  if (body.phone !== undefined) contactData.phone = body.phone;
  if (body.jobTitle !== undefined) contactData.jobTitle = body.jobTitle;

  // Set password for local portal auth
  if (body.password && typeof body.password === "string" && body.password.length >= 6) {
    contactData.passwordHash = await bcrypt.hash(body.password, 12);
  }

  if (Object.keys(contactData).length > 0) {
    await prisma.contact.update({ where: { id: contactId }, data: contactData });
  }

  // Upsert PortalAccessUser for permissions
  if (body.portalRole !== undefined || body.permissions) {
    const perms = body.permissions ?? {};
    const role = body.portalRole ?? contact.portalAccess?.portalRole ?? "VIEWER";

    // Build permission set based on role presets or explicit overrides
    const isAdmin = role === "ADMIN";
    const isManager = role === "MANAGER";

    const permData = {
      portalRole: role,
      canAccessPortal: perms.canAccessPortal ?? true,
      canSeeOwnTickets: perms.canSeeOwnTickets ?? true,
      canSeeAllOrgTickets: perms.canSeeAllOrgTickets ?? (isAdmin || isManager),
      canCreateTickets: perms.canCreateTickets ?? true,
      canSeeProjects: perms.canSeeProjects ?? (isAdmin || isManager),
      canSeeProjectDetails: perms.canSeeProjectDetails ?? (isAdmin || isManager),
      canSeeProjectTasks: perms.canSeeProjectTasks ?? isAdmin,
      canSeeProjectLinkedTickets: perms.canSeeProjectLinkedTickets ?? isAdmin,
      canSeeReports: perms.canSeeReports ?? (isAdmin || isManager),
      canSeeBillingReports: perms.canSeeBillingReports ?? isAdmin,
      canSeeTimeReports: perms.canSeeTimeReports ?? isAdmin,
      canSeeHourBankBalance: perms.canSeeHourBankBalance ?? isAdmin,
      canSeeDocuments: perms.canSeeDocuments ?? (isAdmin || isManager),
      canSeeTeamMembers: perms.canSeeTeamMembers ?? (isAdmin || isManager),
      canSeeOwnAssets: perms.canSeeOwnAssets ?? true,
      canSeeAllOrgAssets: perms.canSeeAllOrgAssets ?? (isAdmin || isManager),
      canManageAssets: perms.canManageAssets ?? isAdmin,
      canManageContacts: perms.canManageContacts ?? isAdmin,
    };

    await prisma.portalAccessUser.upsert({
      where: { organizationId_email: { organizationId: orgId, email: contact.email } },
      create: {
        organizationId: orgId,
        contactId,
        name: `${contact.firstName} ${contact.lastName}`,
        email: contact.email,
        ...permData,
      },
      update: permData,
    });
  }

  // Return updated contact
  const updated = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { portalAccess: true },
  });

  return NextResponse.json(updated);
}
