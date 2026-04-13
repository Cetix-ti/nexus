import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { listAteraAvailablePatches } from "@/lib/integrations/atera-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { externalSource: true, metadata: true, assignedContactId: true },
  });

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Viewers can only see their own assets
  const canSeeAll =
    user.permissions.canSeeAllOrgAssets || user.portalRole === "ADMIN";
  if (!canSeeAll && asset.assignedContactId !== user.contactId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (asset.externalSource !== "atera") {
    return NextResponse.json([]);
  }

  const deviceGuid = (asset.metadata as any)?.deviceGuid;
  if (!deviceGuid) {
    return NextResponse.json([]);
  }

  try {
    const patches = await listAteraAvailablePatches(deviceGuid);
    return NextResponse.json(
      patches.map((p) => ({
        name: p.name,
        category: p.class ?? null,
        kbId: p.kbId ?? null,
        status: p.status ?? null,
      })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
