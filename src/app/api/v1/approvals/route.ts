import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const orgId = searchParams.get("orgId");
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (orgId) where.organizationId = orgId;
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;
  const items = await prisma.approvalRequest.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      decidedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const targetType = String(body?.targetType ?? "");
  const targetId = String(body?.targetId ?? "");
  const action = String(body?.action ?? "");
  if (!targetType || !targetId || !action) {
    return NextResponse.json({ error: "targetType, targetId et action requis" }, { status: 400 });
  }
  const created = await prisma.approvalRequest.create({
    data: {
      organizationId: body?.organizationId || null,
      targetType,
      targetId,
      action,
      justification: body?.justification || null,
      payload: body?.payload ?? null,
      requestedByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
