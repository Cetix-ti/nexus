// Lignes d'un budget — POST crée une ligne manuelle ; GET liste (déjà inclus
// dans /budgets/[id] GET, mais endpoint pratique pour pagination/filtres).

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

async function loadBudget(id: string) {
  return prisma.budget.findUnique({ where: { id }, select: { id: true, organizationId: true, status: true, currency: true } });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await loadBudget(id);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, b.organizationId);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const where: Record<string, unknown> = { budgetId: id };
  const category = searchParams.get("category");
  const status = searchParams.get("status");
  if (category) where.category = category;
  if (status) where.status = status;

  const lines = await prisma.budgetLine.findMany({
    where,
    orderBy: [{ category: "asc" }, { dueDate: "asc" }],
  });
  return NextResponse.json(lines);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await loadBudget(id);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, b.organizationId);
  if (!guard.ok) return guard.res;

  // Post-APPROVED, on n'autorise plus l'ajout de lignes MANUAL sans passer par une
  // révision formelle du budget. Agent peut toujours éditer (patch) des lignes
  // existantes (committed/actual), mais pas en ajouter.
  if (["CLOSED", "REJECTED"].includes(b.status)) {
    return NextResponse.json({ error: "Budget fermé ou rejeté — ajout de ligne interdit." }, { status: 400 });
  }

  const body = await req.json();
  const category = body?.category as BudgetCategory;
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "category invalide" }, { status: 400 });
  }
  if (typeof body?.plannedAmount !== "number" && typeof body?.plannedAmount !== "string") {
    return NextResponse.json({ error: "plannedAmount requis (nombre)" }, { status: 400 });
  }
  if (!body?.label?.trim()) {
    return NextResponse.json({ error: "label requis" }, { status: 400 });
  }

  const line = await prisma.budgetLine.create({
    data: {
      budgetId: id,
      category,
      source: "MANUAL",
      sourceRefType: null,
      sourceRefId: null,
      label: String(body.label).trim(),
      vendor: body?.vendor || null,
      plannedMonth: typeof body?.plannedMonth === "number" ? body.plannedMonth : null,
      plannedAmount: body.plannedAmount,
      currency: body?.currency || b.currency,
      status: LINE_STATUSES.includes(body?.status) ? body.status : "PLANNED",
      visibility: VIS.includes(body?.visibility) ? body.visibility : "CLIENT_ADMIN",
      notes: body?.notes || null,
      dueDate: body?.dueDate ? new Date(body.dueDate) : null,
      createdByUserId: me.id,
      updatedByUserId: me.id,
    },
  });
  return NextResponse.json(line, { status: 201 });
}
