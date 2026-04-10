import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET() {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.portalRole !== "ADMIN" && !user.permissions.canManageContacts) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contacts = await prisma.contact.findMany({
    where: { organizationId: user.organizationId },
    include: {
      assignedAssets: { select: { id: true, name: true, type: true } },
    },
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }],
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
      portalStatus: c.portalStatus ?? (c.isActive ? "active" : "inactive"),
      assignedAssets: c.assignedAssets,
    })),
  );
}
