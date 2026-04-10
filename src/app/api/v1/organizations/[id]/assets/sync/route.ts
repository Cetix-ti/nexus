import type { NextRequest } from "next/server";
import { successResponse } from "@/lib/api-helpers";
import type { AssetSource, OrgAsset } from "@/lib/assets/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let provider: AssetSource = "atera";
  try {
    const body = (await req.json().catch(() => ({}))) as { provider?: AssetSource };
    if (body.provider) provider = body.provider;
  } catch {
    // ignore
  }

  const now = new Date().toISOString();
  const created: OrgAsset[] = [
    {
      id: `ast-sync-${Date.now()}-1`,
      organizationId: id,
      name: `SYNC-${provider.toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
      type: "workstation",
      status: "active",
      source: provider,
      manufacturer: "Dell",
      model: "OptiPlex 7090",
      os: "Windows",
      osVersion: "11 Pro",
      cpuCores: 8,
      ramGb: 16,
      storageGb: 512,
      ipAddress: `10.10.20.${Math.floor(Math.random() * 200 + 20)}`,
      isMonitored: true,
      tags: ["auto-sync"],
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: now,
      lastSeenAt: now,
    },
    {
      id: `ast-sync-${Date.now()}-2`,
      organizationId: id,
      name: `SYNC-${provider.toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
      type: "laptop",
      status: "active",
      source: provider,
      manufacturer: "Lenovo",
      model: "ThinkPad T14",
      os: "Windows",
      osVersion: "11 Pro",
      cpuCores: 8,
      ramGb: 16,
      storageGb: 512,
      isMonitored: true,
      tags: ["auto-sync"],
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: now,
    },
  ];

  return successResponse(
    { assets: created, syncedCount: created.length },
    { provider, syncedAt: now, organizationId: id }
  );
}
