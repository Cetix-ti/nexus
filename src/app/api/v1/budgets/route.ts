// ============================================================================
// Budgets — liste + création.
// Staff MSP voit tous les budgets (filter par orgId). Clients n'accèdent pas
// à cette route agent — ils passent par /api/portal/budget.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertUserOrgAccess, getAccessibleOrgIds } from "@/lib/auth/org-access";
import { getCurrentFiscalYear } from "@/lib/budgets/fiscal-year";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const status = searchParams.get("status");
  const fiscalYear = searchParams.get("fiscalYear");

  const where: Record<string, unknown> = {};
  if (orgId) {
    const guard = await assertUserOrgAccess(me, orgId);
    if (!guard.ok) return guard.res;
    where.organizationId = orgId;
  } else {
    const accessible = await getAccessibleOrgIds(me);
    if (accessible !== null) {
      if (accessible.length === 0) return NextResponse.json([]);
      where.organizationId = { in: accessible };
    }
  }
  if (status) where.status = status;
  if (fiscalYear) where.fiscalYear = parseInt(fiscalYear, 10);

  const items = await prisma.budget.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      _count: { select: { lines: true, comments: true } },
    },
    orderBy: [{ fiscalYear: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const organizationId = String(body?.organizationId ?? "");
  if (!organizationId) return NextResponse.json({ error: "organizationId requis" }, { status: 400 });
  const guard = await assertUserOrgAccess(me, organizationId);
  if (!guard.ok) return guard.res;

  const fiscalYear = typeof body?.fiscalYear === "number"
    ? body.fiscalYear
    : await getCurrentFiscalYear(organizationId);

  const existing = await prisma.budget.findUnique({
    where: { organizationId_fiscalYear: { organizationId, fiscalYear } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: `Un budget existe déjà pour ${fiscalYear}`, budgetId: existing.id }, { status: 409 });
  }

  const created = await prisma.budget.create({
    data: {
      organizationId,
      fiscalYear,
      title: body?.title || `Budget IT ${fiscalYear}`,
      summary: body?.summary || null,
      currency: body?.currency || "CAD",
      targetAmount: body?.targetAmount ?? null,
      contingencyPct: typeof body?.contingencyPct === "number" ? body.contingencyPct : 0,
      internalNotes: body?.internalNotes || null,
      visibility: body?.visibility === "INTERNAL" ? "INTERNAL" : "CLIENT_ADMIN",
      createdByUserId: me.id,
      updatedByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
