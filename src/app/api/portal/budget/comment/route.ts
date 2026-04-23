// Commentaire client sur un budget (source=portal).
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { getCurrentFiscalYear } from "@/lib/budgets/fiscal-year";

export async function POST(req: Request) {
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!portalUser.permissions.canSeeBudget) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body?.body?.trim()) return NextResponse.json({ error: "body requis" }, { status: 400 });

  const fy = typeof body?.fiscalYear === "number"
    ? body.fiscalYear
    : await getCurrentFiscalYear(portalUser.organizationId);

  const budget = await prisma.budget.findUnique({
    where: { organizationId_fiscalYear: { organizationId: portalUser.organizationId, fiscalYear: fy } },
    select: { id: true, status: true },
  });
  if (!budget || !["PROPOSED", "APPROVED", "EXECUTING"].includes(budget.status)) {
    return NextResponse.json({ error: "Budget non commentable." }, { status: 400 });
  }

  const comment = await prisma.budgetComment.create({
    data: {
      budgetId: budget.id,
      lineId: body?.lineId || null,
      body: String(body.body).slice(0, 4000),
      source: "portal",
      authorPortalUserId: portalUser.contactId,
      authorName: portalUser.name,
    },
  });
  return NextResponse.json(comment, { status: 201 });
}
