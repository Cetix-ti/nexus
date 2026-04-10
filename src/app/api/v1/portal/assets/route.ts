import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET() {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canSeeAll =
    user.permissions.canSeeAllOrgAssets ||
    user.portalRole === "ADMIN" ||
    user.portalRole === "MANAGER";

  const where: any = { organizationId: user.organizationId };
  if (!canSeeAll) {
    where.assignedContactId = user.contactId;
  }

  const assets = await prisma.asset.findMany({
    where,
    include: {
      site: { select: { name: true } },
      assignedContact: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      status: a.status,
      manufacturer: a.manufacturer,
      model: a.model,
      serialNumber: a.serialNumber,
      ipAddress: a.ipAddress,
      siteName: a.site?.name ?? null,
      assignedContact: a.assignedContact
        ? {
            id: a.assignedContact.id,
            name: `${a.assignedContact.firstName} ${a.assignedContact.lastName}`,
            email: a.assignedContact.email,
          }
        : null,
      externalSource: a.externalSource,
      externalId: a.externalId,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  );
}

export async function POST(req: Request) {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.permissions.canManageAssets && user.portalRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.name || !body.type) {
    return NextResponse.json({ error: "name and type required" }, { status: 422 });
  }

  const asset = await prisma.asset.create({
    data: {
      organizationId: user.organizationId,
      name: body.name,
      type: body.type,
      status: body.status ?? "ACTIVE",
      manufacturer: body.manufacturer,
      model: body.model,
      serialNumber: body.serialNumber,
      ipAddress: body.ipAddress,
      assignedContactId: body.assignedContactId,
    },
  });

  return NextResponse.json(asset, { status: 201 });
}
