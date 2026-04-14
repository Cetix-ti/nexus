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

// Fields that Atera sync can write — used to build dynamic update clause
const SYNCABLE_FIELDS = [
  "name",
  "type",
  "status",
  "manufacturer",
  "model",
  "serialNumber",
  "ipAddress",
  "macAddress",
] as const;

// Map Atera type string → Prisma AssetType enum
const TYPE_MAP: Record<string, string> = {
  windows_server: "SERVER",
  linux_server: "SERVER",
  workstation: "WORKSTATION",
  laptop: "LAPTOP",
  printer: "PRINTER",
  network: "NETWORK",
  switch: "NETWORK",
  router: "NETWORK",
  firewall: "NETWORK",
};

// Prisma DB enum → frontend UI type labels
const DB_TYPE_TO_UI: Record<string, string> = {
  WORKSTATION: "workstation",
  LAPTOP: "laptop",
  SERVER: "windows_server",
  VIRTUAL_MACHINE: "server_virtual",
  NETWORK: "network_switch",
  PRINTER: "printer",
  MOBILE: "laptop",
  OTHER: "workstation",
};

/**
 * Read cached Atera assets from DB for a given org.
 * Used as fallback when the Atera API is unreachable.
 */
async function getCachedAssets(orgId: string) {
  const dbAssets = await prisma.asset.findMany({
    where: { organizationId: orgId, externalSource: "atera" },
    include: {
      site: { select: { name: true } },
      assignedContact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { name: "asc" },
  });

  return dbAssets.map((a) => ({
    id: a.id,
    organizationId: a.organizationId,
    name: a.name,
    type: DB_TYPE_TO_UI[a.type] ?? a.type.toLowerCase(),
    status: a.status.toLowerCase(),
    source: a.externalSource ?? "atera",
    externalId: a.externalId,
    manufacturer: a.manufacturer,
    model: a.model,
    serialNumber: a.serialNumber,
    ipAddress: a.ipAddress,
    macAddress: a.macAddress,
    siteName: a.site?.name ?? null,
    assignedContactId: a.assignedContactId,
    assignedToContactName: a.assignedContact
      ? `${a.assignedContact.firstName} ${a.assignedContact.lastName}`
      : null,
    os: (a.metadata as any)?.os ?? null,
    osVersion: (a.metadata as any)?.osVersion ?? null,
    cpuModel: (a.metadata as any)?.cpuModel ?? null,
    ramGb: (a.metadata as any)?.ramGb ?? null,
    lastLoggedUser: (a.metadata as any)?.lastLoggedUser ?? null,
    isMonitored: true,
    lastSeenAt: (a.metadata as any)?.lastSeenAt ?? a.updatedAt.toISOString(),
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    fieldOverrides: a.fieldOverrides,
    tags: ["atera-sync"],
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));
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

  // ------------------------------------------------------------------
  // Fetch from Atera API — fallback to local DB cache on failure
  // ------------------------------------------------------------------
  let agents: Awaited<ReturnType<typeof listAteraAgentsForCustomer>>;
  try {
    agents = await listAteraAgentsForCustomer(customerId);
  } catch (err) {
    // Atera API unreachable — serve from local cache
    console.warn(
      `[atera-sync] API unreachable for customer ${customerId}:`,
      err instanceof Error ? err.message : err,
    );
    const cached = await getCachedAssets(orgId);
    return NextResponse.json({
      success: true,
      data: cached,
      meta: {
        total: cached.length,
        persisted: 0,
        ateraCustomerId: customerId,
        organizationId: orgId,
        fromCache: true,
        cacheReason: err instanceof Error ? err.message : "Atera API unreachable",
      },
    });
  }

  // ------------------------------------------------------------------
  // Sync each agent to DB — respect field overrides
  // ------------------------------------------------------------------
  const mapped = agents.map((a) => mapAteraAgentToOrgAsset(a, orgId));
  const now = new Date();
  let persisted = 0;

  for (const asset of mapped) {
    try {
      const assetType = TYPE_MAP[asset.type?.toLowerCase()] || "OTHER";
      const assetStatus =
        asset.status?.toLowerCase() === "active"
          ? "ACTIVE"
          : asset.status?.toLowerCase() === "inactive"
            ? "INACTIVE"
            : "ACTIVE";
      const externalKey = `atera_${asset.externalId || asset.id}`;

      const meta = {
        os: asset.os,
        osVersion: asset.osVersion,
        cpuModel: asset.cpuModel,
        ramGb: asset.ramGb,
        lastSeenAt: asset.lastSeenAt,
        lastLoggedUser: asset.lastLoggedUser,
        ateraCustomerId: customerId,
        deviceGuid: asset.deviceGuid,
        source: "atera",
      };

      // Check if this asset already exists and has field overrides
      const existing = await prisma.asset.findUnique({
        where: { externalId: externalKey },
        select: { fieldOverrides: true },
      });

      const overrides = new Set(existing?.fieldOverrides ?? []);

      // Build update clause, skipping overridden fields
      const fullUpdate: Record<string, any> = {
        name: asset.name,
        type: assetType,
        status: assetStatus,
        manufacturer: asset.manufacturer || null,
        model: asset.model || null,
        serialNumber: asset.serialNumber || null,
        ipAddress: asset.ipAddress || null,
        macAddress: asset.macAddress || null,
      };

      const update: Record<string, any> = {};
      for (const field of SYNCABLE_FIELDS) {
        if (!overrides.has(field)) {
          update[field] = fullUpdate[field];
        }
      }
      // Metadata is always updated (contains live telemetry data)
      update.metadata = meta;
      update.lastSyncedAt = now;

      await prisma.asset.upsert({
        where: { externalId: externalKey },
        update,
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
          macAddress: asset.macAddress || null,
          metadata: meta,
          lastSyncedAt: now,
        },
      });
      persisted++;
    } catch (e) {
      console.error(
        `[atera-sync] Asset ${asset.name}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Update mapping sync timestamp
  await prisma.orgIntegrationMapping.updateMany({
    where: { organizationId: orgId, provider: "atera" },
    data: { lastSyncAt: now, syncedRecordCount: persisted },
  });

  // Re-read all persisted Atera assets from DB (includes overridden fields)
  const assets = await getCachedAssets(orgId);

  return NextResponse.json({
    success: true,
    data: assets,
    meta: {
      total: assets.length,
      persisted,
      ateraCustomerId: customerId,
      organizationId: orgId,
      syncedAt: now.toISOString(),
      fromCache: false,
    },
  });
}
