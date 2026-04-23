// Commentaires sur un budget (source=agent via cette route).

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await prisma.budget.findUnique({ where: { id }, select: { organizationId: true } });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, b.organizationId);
  if (!guard.ok) return guard.res;

  const comments = await prisma.budgetComment.findMany({
    where: { budgetId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(comments);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await prisma.budget.findUnique({ where: { id }, select: { organizationId: true } });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, b.organizationId);
  if (!guard.ok) return guard.res;
  const body = await req.json();
  if (!body?.body?.trim()) return NextResponse.json({ error: "body requis" }, { status: 400 });

  const comment = await prisma.budgetComment.create({
    data: {
      budgetId: id,
      lineId: body?.lineId || null,
      body: String(body.body).slice(0, 4000),
      source: "agent",
      authorId: me.id,
      authorName: `${me.firstName} ${me.lastName}`.trim(),
    },
  });
  return NextResponse.json(comment, { status: 201 });
}
