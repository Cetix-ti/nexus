import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const dbAssets = await prisma.asset.findMany({
    where: { organizationId: id },
    include: {
      site: { select: { name: true } },
      assignedContact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { name: "asc" },
  });

  // Map to OrgAsset shape expected by the frontend
  const assets = dbAssets.map((a) => ({
    id: a.id,
    organizationId: a.organizationId,
    name: a.name,
    type: a.type.toLowerCase(),
    status: a.status.toLowerCase(),
    source: a.externalSource ?? "manual",
    externalId: a.externalId,
    manufacturer: a.manufacturer,
    model: a.model,
    serialNumber: a.serialNumber,
    ipAddress: a.ipAddress,
    macAddress: a.macAddress,
    siteName: a.site?.name ?? null,
    assignedToContactName: a.assignedContact
      ? `${a.assignedContact.firstName} ${a.assignedContact.lastName}`
      : null,
    isMonitored: !!a.externalSource,
    lastSeenAt: a.updatedAt.toISOString(),
    tags: [],
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    metadata: a.metadata,
  }));

  return NextResponse.json(assets);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    if (!body.name || !body.type) {
      return NextResponse.json(
        { error: "Les champs 'name' et 'type' sont requis" },
        { status: 422 },
      );
    }

    const asset = await prisma.asset.create({
      data: {
        organizationId: id,
        name: body.name,
        type: (body.type as string).toUpperCase() as any,
        status: body.status ? (body.status as string).toUpperCase() as any : "ACTIVE",
        manufacturer: body.manufacturer,
        model: body.model,
        serialNumber: body.serialNumber,
        ipAddress: body.ipAddress,
        macAddress: body.macAddress,
        notes: body.notes,
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }
}
