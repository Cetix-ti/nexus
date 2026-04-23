import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
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
  if (assetId) where.assetId = assetId;
  if (orgId) where.organizationId = orgId;
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
  const created = await prisma.assetSubscription.create({
    data: {
      assetId: body?.assetId || null,
      softwareInstanceId: body?.softwareInstanceId || null,
      organizationId,
      vendor: body?.vendor || null,
      plan: body?.plan || null,
      reference: body?.reference || null,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
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
