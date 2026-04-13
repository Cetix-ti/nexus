import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { listAteraAgentSoftware } from "@/lib/integrations/atera-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { externalSource: true, externalId: true, assignedContactId: true },
  });

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Viewers can only see their own assets
  const canSeeAll =
    user.permissions.canSeeAllOrgAssets || user.portalRole === "ADMIN";
  if (!canSeeAll && asset.assignedContactId !== user.contactId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  console.log("[portal-software] asset:", { id, externalSource: asset.externalSource, externalId: asset.externalId });

  if (asset.externalSource !== "atera" || !asset.externalId) {
    console.log("[portal-software] skipped: no atera source");
    return NextResponse.json([]);
  }

  // externalId may be stored as "atera_123" or just "123"
  const rawId = asset.externalId.replace(/^atera_/, "");
  const agentId = parseInt(rawId, 10);
  console.log("[portal-software] agentId:", agentId, "from rawId:", rawId);
  if (Number.isNaN(agentId)) {
    return NextResponse.json([]);
  }

  try {
    const software = await listAteraAgentSoftware(agentId);
    console.log("[portal-software] fetched:", software.length, "items");
    return NextResponse.json(
      software.map((s) => ({
        name: s.AppName,
        version: s.Version ?? null,
        publisher: s.Publisher ?? null,
        installedDate: s.InstalledDate ?? null,
      })),
    );
  } catch (err) {
    console.error("[portal-software] error:", err instanceof Error ? err.message : err);
    return NextResponse.json([]);
  }
}
