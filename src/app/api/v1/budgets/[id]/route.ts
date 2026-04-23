// GET / PATCH / DELETE d'un budget.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";
import type { BudgetStatus, ContentVisibility } from "@prisma/client";

const STATUSES: BudgetStatus[] = ["DRAFT", "PROPOSED", "APPROVED", "EXECUTING", "CLOSED", "REJECTED"];
const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

async function loadAndAuthorize(me: Parameters<typeof assertSameOrg>[0], id: string) {
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget) return { ok: false as const, res: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const guard = await assertSameOrg(me, budget.organizationId);
  if (!guard.ok) return { ok: false as const, res: guard.res };
  return { ok: true as const, budget };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const loaded = await loadAndAuthorize(me, id);
  if (!loaded.ok) return loaded.res;

  const full = await prisma.budget.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      lines: { orderBy: [{ category: "asc" }, { dueDate: "asc" }] },
      comments: { orderBy: { createdAt: "desc" }, take: 50 },
      versions: { orderBy: { version: "desc" }, take: 10, select: { id: true, version: true, statusAtSnapshot: true, note: true, createdAt: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      updatedBy: { select: { firstName: true, lastName: true } },
    },
  });
  return NextResponse.json(full);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const loaded = await loadAndAuthorize(me, id);
  if (!loaded.ok) return loaded.res;
  const body = await req.json();

  // Transition de statut : seuls DRAFT→PROPOSED (via /propose), PROPOSED→APPROVED|REJECTED
  // (via /approve), APPROVED→EXECUTING→CLOSED en manuel sont autorisés ici. Le PATCH
  // "nu" autorise de passer EXECUTING→CLOSED, REJECTED→DRAFT pour retravailler.
  const data: Record<string, unknown> = { updatedByUserId: me.id };
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if ("summary" in body) data.summary = body.summary || null;
  if ("internalNotes" in body) data.internalNotes = body.internalNotes || null;
  if ("targetAmount" in body) data.targetAmount = body.targetAmount ?? null;
  if (typeof body.contingencyPct === "number") data.contingencyPct = body.contingencyPct;
  if (body.currency) data.currency = body.currency;
  if (body.visibility && VIS.includes(body.visibility)) data.visibility = body.visibility;
  if (body.status && STATUSES.includes(body.status)) {
    const from = loaded.budget.status;
    const to = body.status as BudgetStatus;
    const allowed =
      (from === "EXECUTING" && to === "CLOSED") ||
      (from === "APPROVED" && to === "EXECUTING") ||
      (from === "REJECTED" && to === "DRAFT") ||
      (from === "CLOSED" && to === "EXECUTING"); // réouverture administrative
    if (!allowed) {
      return NextResponse.json(
        { error: `Transition ${from} → ${to} non autorisée via PATCH. Utiliser /propose ou /approve.` },
        { status: 400 },
      );
    }
    data.status = to;
    if (to === "CLOSED") data.closedAt = new Date();
  }

  const updated = await prisma.budget.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const loaded = await loadAndAuthorize(me, id);
  if (!loaded.ok) return loaded.res;
  // Garde-fou : pas de suppression après APPROVED — statut EXECUTING/CLOSED → ARCHIVAGE.
  if (["APPROVED", "EXECUTING", "CLOSED"].includes(loaded.budget.status)) {
    return NextResponse.json({ error: "Budget approuvé/exécuté non supprimable." }, { status: 400 });
  }
  await prisma.budget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
