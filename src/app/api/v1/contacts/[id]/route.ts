import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { organization: { select: { id: true, name: true } } },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
  }
  return NextResponse.json(contact);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.firstName !== undefined) data.firstName = body.firstName;
  if (body.lastName !== undefined) data.lastName = body.lastName;
  if (body.email !== undefined) data.email = body.email;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle;
  if (body.isVIP !== undefined) data.isVIP = body.isVIP;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  if (Object.keys(data).length === 0 && !body.portalAccess) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  try {
    const updated = await prisma.contact.update({
      where: { id },
      data,
      include: { organization: { select: { id: true, name: true } } },
    });

    // Sync portal access if provided
    if (body.portalAccess && updated.organizationId) {
      const pa = body.portalAccess;
      await prisma.portalAccessUser.upsert({
        where: { contactId: id },
        update: {
          portalRole: pa.portalRole || "STANDARD",
          canAccessPortal: pa.canAccessPortal ?? true,
          canSeeOwnTickets: pa.canSeeOwnTickets ?? true,
          canSeeAllOrgTickets: pa.canSeeAllOrgTickets ?? false,
          canCreateTickets: pa.canCreateTickets ?? true,
          canSeeProjects: pa.canSeeProjects ?? false,
          canSeeProjectDetails: pa.canSeeProjectDetails ?? false,
          canSeeProjectTasks: pa.canSeeProjectTasks ?? false,
          canSeeProjectLinkedTickets: pa.canSeeProjectLinkedTickets ?? false,
          canSeeReports: pa.canSeeReports ?? false,
          canSeeBillingReports: pa.canSeeBillingReports ?? false,
          canSeeTimeReports: pa.canSeeTimeReports ?? false,
          canSeeHourBankBalance: pa.canSeeHourBankBalance ?? false,
          canSeeDocuments: pa.canSeeDocuments ?? false,
          canSeeTeamMembers: pa.canSeeTeamMembers ?? false,
          canSeeOwnAssets: pa.canSeeOwnAssets ?? true,
          canSeeAllOrgAssets: pa.canSeeAllOrgAssets ?? false,
          canManageAssets: pa.canManageAssets ?? false,
          canManageContacts: pa.canManageContacts ?? false,
        },
        create: {
          organizationId: updated.organizationId,
          contactId: id,
          name: `${updated.firstName} ${updated.lastName}`,
          email: updated.email,
          portalRole: pa.portalRole || "STANDARD",
          canAccessPortal: pa.canAccessPortal ?? true,
          canSeeOwnTickets: pa.canSeeOwnTickets ?? true,
          canSeeAllOrgTickets: pa.canSeeAllOrgTickets ?? false,
          canCreateTickets: pa.canCreateTickets ?? true,
          canSeeProjects: pa.canSeeProjects ?? false,
          canSeeProjectDetails: pa.canSeeProjectDetails ?? false,
          canSeeProjectTasks: pa.canSeeProjectTasks ?? false,
          canSeeProjectLinkedTickets: pa.canSeeProjectLinkedTickets ?? false,
          canSeeReports: pa.canSeeReports ?? false,
          canSeeBillingReports: pa.canSeeBillingReports ?? false,
          canSeeTimeReports: pa.canSeeTimeReports ?? false,
          canSeeHourBankBalance: pa.canSeeHourBankBalance ?? false,
          canSeeDocuments: pa.canSeeDocuments ?? false,
          canSeeTeamMembers: pa.canSeeTeamMembers ?? false,
          canSeeOwnAssets: pa.canSeeOwnAssets ?? true,
          canSeeAllOrgAssets: pa.canSeeAllOrgAssets ?? false,
          canManageAssets: pa.canManageAssets ?? false,
          canManageContacts: pa.canManageContacts ?? false,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de mise à jour" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await prisma.contact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de suppression" },
      { status: 500 }
    );
  }
}
