// POST /api/v1/budgets/[id]/approve — finalise une décision d'approbation
// (APPROVED ou REJECTED). Normalement, l'approbation se fait via l'UI
// /approvals/[id] qui met à jour l'ApprovalRequest ; cette route est le
// "miroir côté budget" qui applique les effets (transition statut + snapshot).
//
// Body: { decision: "APPROVED" | "REJECTED", decisionNote?: string }

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";

const DECIDER_ROLES = ["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR"] as const;

async function canDecide(userId: string, userRole: string, organizationId: string): Promise<boolean> {
  if ((DECIDER_ROLES as readonly string[]).includes(userRole)) return true;
  const d = await prisma.approvalDelegate.findFirst({
    where: { userId, organizationId }, select: { id: true },
  });
  return Boolean(d);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const budget = await prisma.budget.findUnique({ where: { id }, include: { lines: true } });
  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, budget.organizationId);
  if (!guard.ok) return guard.res;
  if (budget.status !== "PROPOSED") {
    return NextResponse.json({ error: `Statut ${budget.status} : seul PROPOSED peut être décidé.` }, { status: 400 });
  }
  const allowed = await canDecide(me.id, me.role, budget.organizationId);
  if (!allowed) return NextResponse.json({ error: "Non autorisé à décider pour cette organisation." }, { status: 403 });

  const body = await req.json();
  const decision = String(body?.decision ?? "").toUpperCase();
  if (!["APPROVED", "REJECTED"].includes(decision)) {
    return NextResponse.json({ error: "decision doit être APPROVED ou REJECTED" }, { status: 400 });
  }

  const lastVersion = await prisma.budgetVersion.findFirst({
    where: { budgetId: budget.id }, orderBy: { version: "desc" }, select: { version: true },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  const updated = await prisma.$transaction(async (tx) => {
    if (budget.approvalId) {
      await tx.approvalRequest.updateMany({
        where: { id: budget.approvalId, status: "PENDING" },
        data: {
          status: decision as "APPROVED" | "REJECTED",
          decidedByUserId: me.id,
          decidedAt: new Date(),
          decisionNote: body?.decisionNote || null,
        },
      });
    }
    await tx.budgetVersion.create({
      data: {
        budgetId: budget.id,
        version: nextVersion,
        statusAtSnapshot: decision === "APPROVED" ? "APPROVED" : "REJECTED",
        snapshot: { budget, lines: budget.lines } as unknown as object,
        note: body?.decisionNote || null,
        authorId: me.id,
      },
    });
    return tx.budget.update({
      where: { id: budget.id },
      data: {
        status: decision === "APPROVED" ? "APPROVED" : "REJECTED",
        approvedAt: decision === "APPROVED" ? new Date() : null,
        updatedByUserId: me.id,
      },
    });
  });

  return NextResponse.json(updated);
}
