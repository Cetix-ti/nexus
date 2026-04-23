import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const items = await prisma.bugComment.findMany({
    where: { bugId: id },
    include: { author: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.body?.trim()) return NextResponse.json({ error: "body requis" }, { status: 400 });

  const created = await prisma.bugComment.create({
    data: {
      bugId: id,
      body: String(body.body).slice(0, 10_000),
      authorUserId: me.id,
      authorName: `${me.firstName} ${me.lastName}`.trim(),
    },
  });
  return NextResponse.json(created, { status: 201 });
}
