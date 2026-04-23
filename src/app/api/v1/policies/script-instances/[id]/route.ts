import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.scriptInstance.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      template: true,
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const existing = await prisma.scriptInstance.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data: Record<string, unknown> = { updatedByUserId: me.id };
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if ("bodyCode" in body) data.bodyCode = body.bodyCode ?? "";
  if ("bodyDocMarkdown" in body) data.bodyDocMarkdown = body.bodyDocMarkdown || null;
  if ("resolvedVariables" in body) data.resolvedVariables = body.resolvedVariables ?? null;
  if ("runAs" in body) data.runAs = body.runAs || null;
  if ("schedule" in body) data.schedule = body.schedule || null;
  if (body.visibility && VIS.includes(body.visibility)) data.visibility = body.visibility;
  if (body.detachFromTemplate === true && existing.templateId) data.syncState = "DETACHED";
  if (body.realignToTemplate === true && existing.templateId) {
    const tpl = await prisma.scriptTemplate.findUnique({ where: { id: existing.templateId } });
    if (tpl) { data.templateSchemaVersion = tpl.schemaVersion; data.syncState = "IN_SYNC"; }
  }
  const updated = await prisma.scriptInstance.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.scriptInstance.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
