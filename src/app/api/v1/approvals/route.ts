import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertUserOrgAccess, getAccessibleOrgIds } from "@/lib/auth/org-access";

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
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;

  if (orgId) {
    const guard = await assertUserOrgAccess(me, orgId);
    if (!guard.ok) return guard.res;
    where.organizationId = orgId;
  } else {
    // Pas de filtre orgId : restreindre aux orgs accessibles si non-staff.
    const accessible = await getAccessibleOrgIds(me);
    if (accessible !== null) {
      if (accessible.length === 0) return NextResponse.json([]);
      where.organizationId = { in: accessible };
    }
  }

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

  const organizationId: string | null = body?.organizationId || null;
  if (organizationId) {
    const guard = await assertUserOrgAccess(me, organizationId);
    if (!guard.ok) return guard.res;
  }

  const created = await prisma.approvalRequest.create({
    data: {
      organizationId,
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
