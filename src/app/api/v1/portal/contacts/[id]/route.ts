import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.portalRole !== "ADMIN" && !user.permissions.canManageContacts) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  // Verify contact is in same org
  const contact = await prisma.contact.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {};
  if (body.firstName !== undefined) data.firstName = body.firstName;
  if (body.lastName !== undefined) data.lastName = body.lastName;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.portalStatus !== undefined) data.portalStatus = body.portalStatus;

  const updated = await prisma.contact.update({ where: { id }, data });
  return NextResponse.json(updated);
}
