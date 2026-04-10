import type { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-helpers";
import { getMockAssetsForOrg } from "@/lib/assets/mock-data";
import type { OrgAsset } from "@/lib/assets/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assets = getMockAssetsForOrg(id);
  return successResponse(assets, { total: assets.length, organizationId: id });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = (await req.json()) as Partial<OrgAsset>;
    if (!body.name || !body.type) {
      return errorResponse("Les champs 'name' et 'type' sont requis", 422);
    }
    const now = new Date().toISOString();
    const asset: OrgAsset = {
      id: `ast-${Math.random().toString(36).slice(2, 10)}`,
      organizationId: id,
      name: body.name,
      type: body.type,
      status: body.status ?? "active",
      source: body.source ?? "manual",
      isMonitored: body.isMonitored ?? false,
      tags: body.tags ?? [],
      createdAt: now,
      updatedAt: now,
      manufacturer: body.manufacturer,
      model: body.model,
      serialNumber: body.serialNumber,
      assetTag: body.assetTag,
      os: body.os,
      osVersion: body.osVersion,
      cpuModel: body.cpuModel,
      cpuCores: body.cpuCores,
      ramGb: body.ramGb,
      storageGb: body.storageGb,
      ipAddress: body.ipAddress,
      macAddress: body.macAddress,
      fqdn: body.fqdn,
      siteId: body.siteId,
      siteName: body.siteName,
      rackPosition: body.rackPosition,
      purchaseDate: body.purchaseDate,
      warrantyExpiry: body.warrantyExpiry,
      endOfLifeDate: body.endOfLifeDate,
      purchaseCost: body.purchaseCost,
      assignedToContactName: body.assignedToContactName,
      notes: body.notes,
      externalId: body.externalId,
    };
    return successResponse(asset, undefined, 201);
  } catch {
    return errorResponse("Corps de requête invalide", 400);
  }
}
