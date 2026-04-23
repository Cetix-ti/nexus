import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const existing = await prisma.softwareProcedure.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data: Record<string, unknown> = {};
  let editorial = false;
  if (typeof body.title === "string" && body.title.trim()) { data.title = body.title.trim(); editorial = true; }
  if (typeof body.body === "string") { data.body = body.body; editorial = true; }
  if (body.kind) data.kind = body.kind;
  if (body.visibility) data.visibility = body.visibility;
  if (editorial) data.version = existing.version + 1;
  const updated = await prisma.softwareProcedure.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.softwareProcedure.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
