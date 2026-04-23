import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertUserOrgAccess, getAccessibleOrgIds } from "@/lib/auth/org-access";
import type { ContentVisibility, SubscriptionBillingCycle } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const CYCLES: SubscriptionBillingCycle[] = ["MONTHLY", "QUARTERLY", "YEARLY", "MULTIYEAR", "ONE_TIME", "OTHER"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("assetId");
  const orgId = searchParams.get("orgId");
  const where: Record<string, unknown> = {};

  if (assetId) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { organizationId: true } });
    if (!asset) return NextResponse.json({ error: "Asset introuvable" }, { status: 404 });
    const guard = await assertUserOrgAccess(me, asset.organizationId);
    if (!guard.ok) return guard.res;
    where.assetId = assetId;
  }
  if (orgId) {
    const guard = await assertUserOrgAccess(me, orgId);
    if (!guard.ok) return guard.res;
    where.organizationId = orgId;
  }
  if (!assetId && !orgId) {
    const accessible = await getAccessibleOrgIds(me);
    if (accessible !== null) {
      if (accessible.length === 0) return NextResponse.json([]);
      where.organizationId = { in: accessible };
    }
  }

  const items = await prisma.assetSubscription.findMany({
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
  const organizationId = String(body?.organizationId ?? "");
  if (!organizationId || !body?.startDate || !body?.endDate) {
    return NextResponse.json({ error: "organizationId, startDate, endDate requis" }, { status: 400 });
  }
  const guard = await assertUserOrgAccess(me, organizationId);
  if (!guard.ok) return guard.res;

  // Si assetId fourni, vérifier qu'il appartient à la même org.
  if (body?.assetId) {
    const asset = await prisma.asset.findUnique({ where: { id: body.assetId }, select: { organizationId: true } });
    if (!asset || asset.organizationId !== organizationId) {
      return NextResponse.json({ error: "assetId invalide pour cette organisation" }, { status: 400 });
    }
  }
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (endDate <= startDate) {
    return NextResponse.json({ error: "endDate doit être postérieure à startDate" }, { status: 400 });
  }

  const created = await prisma.assetSubscription.create({
    data: {
      assetId: body?.assetId || null,
      softwareInstanceId: body?.softwareInstanceId || null,
      organizationId,
      vendor: body?.vendor || null,
      plan: body?.plan || null,
      reference: body?.reference || null,
      startDate,
      endDate,
      autoRenew: Boolean(body?.autoRenew),
      billingCycle: CYCLES.includes(body?.billingCycle) ? body.billingCycle : "YEARLY",
      amount: body?.amount ?? null,
      currency: body?.currency || "CAD",
      renewalNotes: body?.renewalNotes || null,
      notes: body?.notes || null,
      visibility: VIS.includes(body?.visibility) ? body.visibility : "INTERNAL",
      contractId: body?.contractId || null,
      createdByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
