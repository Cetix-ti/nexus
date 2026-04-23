// POST /api/v1/budgets/[id]/ingest — lance (ou re-lance) l'ingestion
// automatique des lignes à partir des sources existantes.
// Query ?dryRun=1 → retourne juste les lignes proposées sans écrire.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";
import { ingestBudget } from "@/lib/budgets/ingest";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await prisma.budget.findUnique({ where: { id }, select: { id: true, organizationId: true, status: true } });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, b.organizationId);
  if (!guard.ok) return guard.res;
  if (["CLOSED", "REJECTED"].includes(b.status)) {
    return NextResponse.json({ error: "Ingest impossible sur budget fermé/rejeté." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "1";
  const result = await ingestBudget(id, { dryRun });
  return NextResponse.json(result);
}
