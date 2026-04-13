import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { findWazuhAgentByHostname, getWazuhAgentPackages } from "@/lib/integrations/wazuh-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { name: true, assignedContactId: true },
  });

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Viewers can only see their own assets
  const canSeeAll =
    user.permissions.canSeeAllOrgAssets || user.portalRole === "ADMIN";
  if (!canSeeAll && asset.assignedContactId !== user.contactId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const agent = await findWazuhAgentByHostname(asset.name);
    if (!agent) return NextResponse.json([]);

    const packages = await getWazuhAgentPackages(agent.id);
    return NextResponse.json(
      packages.map((p) => ({
        name: p.name,
        version: p.version ?? null,
        vendor: p.vendor ?? null,
        architecture: p.architecture ?? null,
        installedDate: p.install_time ?? null,
      })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
