// PATCH / DELETE d'une ligne de budget.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";
import type { BudgetCategory, BudgetLineStatus, ContentVisibility } from "@prisma/client";

const CATEGORIES: BudgetCategory[] = [
  "SUBSCRIPTIONS", "LICENSES", "HARDWARE", "OBSOLESCENCE",
  "WARRANTIES", "SUPPORT", "EXTERNAL_SERVICES", "PROJECTS",
  "TRAINING", "TELECOM", "CONTINGENCY", "OTHER",
];
const LINE_STATUSES: BudgetLineStatus[] = ["PLANNED", "COMMITTED", "INVOICED", "PAID", "CANCELLED"];
const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

async function loadLine(id: string) {
  return prisma.budgetLine.findUnique({
    where: { id },
    select: {
      id: true, source: true, status: true,
      budget: { select: { id: true, organizationId: true, status: true } },
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const line = await loadLine(id);
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, line.budget.organizationId);
  if (!guard.ok) return guard.res;

  const body = await req.json();
  const data: Record<string, unknown> = { updatedByUserId: me.id };
  if (body.category && CATEGORIES.includes(body.category)) data.category = body.category;
  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
  if ("vendor" in body) data.vendor = body.vendor || null;
  if ("plannedMonth" in body) data.plannedMonth = typeof body.plannedMonth === "number" ? body.plannedMonth : null;
  if ("plannedAmount" in body) data.plannedAmount = body.plannedAmount;
  if ("committedAmount" in body) data.committedAmount = body.committedAmount ?? null;
  if ("actualAmount" in body) data.actualAmount = body.actualAmount ?? null;
  if (body.currency) data.currency = body.currency;
  if (body.status && LINE_STATUSES.includes(body.status)) data.status = body.status;
  if (body.visibility && VIS.includes(body.visibility)) data.visibility = body.visibility;
  if ("notes" in body) data.notes = body.notes || null;
  if ("dueDate" in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const updated = await prisma.budgetLine.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const line = await loadLine(id);
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, line.budget.organizationId);
  if (!guard.ok) return guard.res;

  // Lignes AUTO_* ne devraient pas être supprimées (re-générées à l'ingest).
  // On permet la suppression mais on le log. Pour les vraiment virer, marquer
  // status=CANCELLED est plus propre.
  if (["COMMITTED", "INVOICED", "PAID"].includes(line.status)) {
    return NextResponse.json({ error: "Ligne engagée — annuler plutôt que supprimer." }, { status: 400 });
  }

  await prisma.budgetLine.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
