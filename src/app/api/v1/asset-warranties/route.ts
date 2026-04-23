import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, WarrantyCoverageLevel } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const COV: WarrantyCoverageLevel[] = ["BASIC", "ADVANCED", "NBD", "FOUR_HOUR", "CUSTOM"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("assetId");
  const orgId = searchParams.get("orgId");
  const where: Record<string, unknown> = {};
  if (assetId) where.assetId = assetId;
  if (orgId) where.organizationId = orgId;
  const items = await prisma.assetWarranty.findMany({
    where,
    include: { asset: { select: { id: true, name: true } }, contract: { select: { id: true, name: true } } },
    orderBy: { endDate: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const assetId = String(body?.assetId ?? "");
  if (!assetId || !body?.startDate || !body?.endDate) {
    return NextResponse.json({ error: "assetId, startDate, endDate requis" }, { status: 400 });
  }
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { organizationId: true } });
  if (!asset) return NextResponse.json({ error: "Asset introuvable" }, { status: 404 });
  const created = await prisma.assetWarranty.create({
    data: {
      assetId,
      organizationId: asset.organizationId,
      vendor: body?.vendor || null,
      reference: body?.reference || null,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      coverageLevel: COV.includes(body?.coverageLevel) ? body.coverageLevel : "BASIC",
      notes: body?.notes || null,
      visibility: VIS.includes(body?.visibility) ? body.visibility : "INTERNAL",
      contractId: body?.contractId || null,
      createdByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
