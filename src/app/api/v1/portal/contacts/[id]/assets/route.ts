import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

/** GET — assets assigned to a specific contact */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Viewer can only see own assets
  if (id !== user.contactId && user.portalRole !== "ADMIN" && !user.permissions.canManageAssets) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assets = await prisma.asset.findMany({
    where: { assignedContactId: id, organizationId: user.organizationId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(assets);
}

/** POST — assign an asset to a contact */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.portalRole !== "ADMIN" && !user.permissions.canManageAssets) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { assetId } = await req.json();
  if (!assetId) {
    return NextResponse.json({ error: "assetId required" }, { status: 422 });
  }

  // Verify asset is in same org
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId: user.organizationId },
  });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const updated = await prisma.asset.update({
    where: { id: assetId },
    data: { assignedContactId: id },
  });

  return NextResponse.json(updated);
}
