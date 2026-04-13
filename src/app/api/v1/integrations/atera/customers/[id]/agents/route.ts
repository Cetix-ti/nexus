import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  listAteraAgentsForCustomer,
  mapAteraAgentToOrgAsset,
} from "@/lib/integrations/atera-client";
import { getCurrentUser } from "@/lib/auth-utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const orgId = request.nextUrl.searchParams.get("orgId") || "unknown";
  const customerId = parseInt(id, 10);

  if (Number.isNaN(customerId)) {
    return NextResponse.json(
      { success: false, error: "Invalid Atera customer id" },
      { status: 400 },
    );
  }

  try {
    const agents = await listAteraAgentsForCustomer(customerId);
    const assets = agents.map((a) => mapAteraAgentToOrgAsset(a, orgId));

    // Persist assets to DB via upsert (so they survive page reload)
    let persisted = 0;
    for (const asset of assets) {
      try {
        // Map Atera type to Prisma AssetType enum
        const typeMap: Record<string, string> = {
          windows_server: "SERVER",
          linux_server: "SERVER",
          workstation: "WORKSTATION",
          laptop: "LAPTOP",
          printer: "PRINTER",
          network: "NETWORK_DEVICE",
          switch: "NETWORK_DEVICE",
          router: "NETWORK_DEVICE",
          firewall: "NETWORK_DEVICE",
        };
        const assetType = typeMap[asset.type?.toLowerCase()] || "OTHER";
        const assetStatus = asset.status?.toLowerCase() === "active" ? "ACTIVE"
          : asset.status?.toLowerCase() === "inactive" ? "INACTIVE" : "ACTIVE";
        const externalKey = `atera_${asset.externalId || asset.id}`;

        const meta = {
          os: asset.os,
          osVersion: asset.osVersion,
          cpuModel: asset.cpuModel,
          ramGb: asset.ramGb,
          lastSeenAt: asset.lastSeenAt,
          lastLoggedUser: asset.lastLoggedUser,
          ateraCustomerId: customerId,
          source: "atera",
        };

        await prisma.asset.upsert({
          where: { externalId: externalKey },
          update: {
            name: asset.name,
            type: assetType as any,
            status: assetStatus as any,
            manufacturer: asset.manufacturer || null,
            model: asset.model || null,
            serialNumber: asset.serialNumber || null,
            ipAddress: asset.ipAddress || null,
            metadata: meta,
          },
          create: {
            organizationId: orgId,
            externalSource: "atera",
            externalId: externalKey,
            name: asset.name,
            type: assetType as any,
            status: assetStatus as any,
            manufacturer: asset.manufacturer || null,
            model: asset.model || null,
            serialNumber: asset.serialNumber || null,
            ipAddress: asset.ipAddress || null,
            metadata: meta,
          },
        });
        persisted++;
      } catch (e) {
        // Skip individual asset errors
        console.error(`[atera-sync] Asset ${asset.name}:`, e instanceof Error ? e.message : e);
      }
    }

    // Update mapping sync timestamp
    await prisma.orgIntegrationMapping.updateMany({
      where: { organizationId: orgId, provider: "atera" },
      data: { lastSyncAt: new Date(), syncedRecordCount: persisted },
    });

    return NextResponse.json({
      success: true,
      data: assets,
      meta: {
        total: assets.length,
        persisted,
        ateraCustomerId: customerId,
        organizationId: orgId,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Erreur Atera",
      },
      { status: 502 },
    );
  }
}
