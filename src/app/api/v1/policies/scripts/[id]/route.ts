import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.scriptTemplate.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      instances: { select: { id: true, title: true, syncState: true, organizationId: true, organization: { select: { name: true, slug: true } } } },
      publications: { select: { id: true, organizationId: true, publishedVersion: true, publishedAt: true, status: true } },
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
  const existing = await prisma.scriptTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { updatedByUserId: me.id };
  let editorial = false;
  if (typeof body.title === "string" && body.title.trim()) { data.title = body.title.trim(); editorial = true; }
  if ("bodyCode" in body) { data.bodyCode = body.bodyCode ?? ""; editorial = true; }
  if ("bodyDocMarkdown" in body) { data.bodyDocMarkdown = body.bodyDocMarkdown || null; editorial = true; }
  if ("variables" in body) { data.variables = body.variables ?? null; editorial = true; }
  if ("categoryId" in body) data.categoryId = body.categoryId || null;
  if ("runAs" in body) data.runAs = body.runAs || null;
  if ("schedule" in body) data.schedule = body.schedule || null;
  if (Array.isArray(body.tags)) data.tags = body.tags.map(String);
  if (body.visibilityDefault && VIS.includes(body.visibilityDefault)) data.visibilityDefault = body.visibilityDefault;
  if (editorial) data.schemaVersion = existing.schemaVersion + 1;

  const updated = await prisma.scriptTemplate.update({ where: { id }, data });
  if (editorial) {
    await prisma.scriptInstance.updateMany({
      where: { templateId: id, syncState: { not: "DETACHED" } },
      data: { syncState: "DRIFTED" },
    });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.scriptTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
