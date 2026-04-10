import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      site: { select: { name: true } },
      assignedContact: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Viewers can only see their own assets
  const canSeeAll =
    user.permissions.canSeeAllOrgAssets || user.portalRole === "ADMIN";
  if (!canSeeAll && asset.assignedContactId !== user.contactId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(asset);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.canManageAssets && user.portalRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {};
  if (body.assignedContactId !== undefined) data.assignedContactId = body.assignedContactId;
  if (body.name !== undefined) data.name = body.name;
  if (body.status !== undefined) data.status = body.status;

  const updated = await prisma.asset.update({ where: { id }, data });
  return NextResponse.json(updated);
}
