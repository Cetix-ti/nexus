import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const dbAssets = await prisma.asset.findMany({
    where: { organizationId: id },
    include: {
      site: { select: { name: true } },
      assignedContact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { name: "asc" },
  });

  // DB enum → frontend AssetType mapping
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

  // Map to OrgAsset shape expected by the frontend
  const assets = dbAssets.map((a) => ({
    id: a.id,
    organizationId: a.organizationId,
    name: a.name,
    type: DB_TYPE_TO_UI[a.type] ?? a.type.toLowerCase(),
    status: a.status.toLowerCase(),
    source: a.externalSource ?? "manual",
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
    isMonitored: !!a.externalSource,
    lastSeenAt: (a.metadata as any)?.lastSeenAt ?? a.updatedAt.toISOString(),
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    fieldOverrides: a.fieldOverrides,
    tags: [],
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return NextResponse.json(assets);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await req.json();
    if (!body.name || !body.type) {
      return NextResponse.json(
        { error: "Les champs 'name' et 'type' sont requis" },
        { status: 422 },
      );
    }

    // Map UI asset types to DB enum
    const UI_TO_DB_TYPE: Record<string, string> = {
      workstation: "WORKSTATION",
      laptop: "LAPTOP",
      server_physical: "SERVER",
      server_virtual: "VIRTUAL_MACHINE",
      windows_server: "SERVER",
      linux_server: "SERVER",
      hypervisor: "SERVER",
      nas: "SERVER",
      san: "SERVER",
      network_switch: "NETWORK",
      router: "NETWORK",
      firewall: "NETWORK",
      wifi_ap: "NETWORK",
      ups: "PERIPHERAL",
      printer: "PRINTER",
      ip_phone: "PERIPHERAL",
      monitoring_appliance: "NETWORK",
      tape_library: "PERIPHERAL",
      cloud_resource: "CLOUD_RESOURCE",
    };
    const rawType = String(body.type || "").toLowerCase();
    const dbType = UI_TO_DB_TYPE[rawType] || rawType.toUpperCase();

    // Store UI-specific type in metadata for round-trip
    const metadata: Record<string, unknown> = {};
    if (UI_TO_DB_TYPE[rawType]) metadata.uiType = rawType;
    if (body.os) metadata.os = body.os;
    if (body.osVersion) metadata.osVersion = body.osVersion;
    if (body.cpuModel) metadata.cpuModel = body.cpuModel;
    if (body.cpuCores) metadata.cpuCores = body.cpuCores;
    if (body.ramGb) metadata.ramGb = body.ramGb;
    if (body.storageGb) metadata.storageGb = body.storageGb;
    if (body.fqdn) metadata.fqdn = body.fqdn;
    if (body.rackPosition) metadata.rackPosition = body.rackPosition;
    if (body.assetTag) metadata.assetTag = body.assetTag;

    try {
      const asset = await prisma.asset.create({
        data: {
          organizationId: id,
          name: body.name,
          type: dbType as any,
          status: body.status ? (body.status as string).toUpperCase() as any : "ACTIVE",
          manufacturer: body.manufacturer || null,
          model: body.model || null,
          serialNumber: body.serialNumber || null,
          ipAddress: body.ipAddress || null,
          macAddress: body.macAddress || null,
          notes: body.notes || null,
          assignedContactId: body.assignedContactId || null,
          purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
          warrantyExpiry: body.warrantyExpiry ? new Date(body.warrantyExpiry) : null,
          metadata: Object.keys(metadata).length > 0 ? (metadata as any) : undefined,
        },
      });
      return NextResponse.json(asset, { status: 201 });
    } catch (err) {
      console.error("[assets POST] create failed:", err);
      return NextResponse.json({ error: "Type d'actif invalide ou données incorrectes" }, { status: 422 });
    }
  } catch (err) {
    console.error("[assets POST]", err);
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }
}
