// POST /api/v1/budgets/[id]/propose — transition DRAFT → PROPOSED, crée
// un ApprovalRequest (targetType="budget") et snapshot une BudgetVersion.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const budget = await prisma.budget.findUnique({ where: { id }, include: { lines: true } });
  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, budget.organizationId);
  if (!guard.ok) return guard.res;
  if (budget.status !== "DRAFT") {
    return NextResponse.json({ error: `Statut ${budget.status} : seul DRAFT peut être proposé.` }, { status: 400 });
  }
  if (budget.lines.length === 0) {
    return NextResponse.json({ error: "Budget vide — au moins une ligne requise avant proposition." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const justification: string = body?.justification || `Budget ${budget.fiscalYear} proposé pour approbation client`;

  // Snapshot immuable avant transition.
  const lastVersion = await prisma.budgetVersion.findFirst({
    where: { budgetId: budget.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  const [approval, updated] = await prisma.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.create({
      data: {
        organizationId: budget.organizationId,
        targetType: "budget",
        targetId: budget.id,
        action: "approve_budget",
        justification,
        payload: { fiscalYear: budget.fiscalYear, title: budget.title, lineCount: budget.lines.length },
        requestedByUserId: me.id,
      },
    });
    await tx.budgetVersion.create({
      data: {
        budgetId: budget.id,
        version: nextVersion,
        statusAtSnapshot: "PROPOSED",
        snapshot: { budget, lines: budget.lines } as unknown as object,
        note: justification,
        authorId: me.id,
      },
    });
    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "PROPOSED",
        proposedAt: new Date(),
        approvalId: approval.id,
        updatedByUserId: me.id,
      },
    });
    return [approval, updated];
  });

  return NextResponse.json({ budget: updated, approval });
}
