import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

/**
 * GET /api/v1/tickets/[id]/assets — list linked assets.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Only staff can see asset-ticket linkage
  if (!hasMinimumRole(me.role, "TECHNICIAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const links = await prisma.ticketAsset.findMany({
    where: { ticketId: id },
    include: {
      asset: {
        select: {
          id: true, name: true, type: true, status: true,
          manufacturer: true, model: true, serialNumber: true,
          ipAddress: true, externalSource: true,
        },
      },
    },
  });

  return NextResponse.json({
    data: links.map((l) => ({
      id: l.asset.id,
      name: l.asset.name,
      type: l.asset.type,
      status: l.asset.status,
      manufacturer: l.asset.manufacturer,
      model: l.asset.model,
      serialNumber: l.asset.serialNumber,
      ipAddress: l.asset.ipAddress,
      externalSource: l.asset.externalSource,
    })),
  });
}

/**
 * POST /api/v1/tickets/[id]/assets — link an asset. Idempotent: linking
 * the same asset twice returns success without duplicating.
 * Body: { assetId: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "TECHNICIAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { assetId } = body as { assetId?: string };
  if (!assetId || typeof assetId !== "string") {
    return NextResponse.json({ error: "assetId required" }, { status: 400 });
  }

  // Verify ticket + asset exist
  const [ticket, asset] = await Promise.all([
    prisma.ticket.findUnique({ where: { id }, select: { id: true } }),
    prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } }),
  ]);
  if (!ticket) return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  if (!asset) return NextResponse.json({ error: "Actif introuvable" }, { status: 404 });

  // Idempotent: if already linked, return ok
  await prisma.ticketAsset.upsert({
    where: { ticketId_assetId: { ticketId: id, assetId } },
    create: { ticketId: id, assetId },
    update: {},
  }).catch(() => {
    // Fallback to createMany with skipDuplicates if compound key isn't set up
    return prisma.ticketAsset.createMany({
      data: [{ ticketId: id, assetId }],
      skipDuplicates: true,
    });
  });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/v1/tickets/[id]/assets?assetId=... — unlink.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "TECHNICIAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const assetId = req.nextUrl.searchParams.get("assetId");
  if (!assetId) {
    return NextResponse.json({ error: "assetId required" }, { status: 400 });
  }

  const result = await prisma.ticketAsset.deleteMany({
    where: { ticketId: id, assetId },
  });
  return NextResponse.json({ ok: true, count: result.count });
}
