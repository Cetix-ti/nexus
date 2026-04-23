import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.softwareTemplate.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      installers: {
        where: { scope: "GLOBAL" },
        include: { _count: { select: { downloadLinks: true } } },
        orderBy: { createdAt: "desc" },
      },
      licenses: {
        orderBy: { endDate: "asc" },
      },
      instances: {
        select: {
          id: true, name: true, organizationId: true, syncState: true, templateSchemaVersion: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      },
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
  const existing = await prisma.softwareTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { updatedByUserId: me.id };
  let editorial = false;
  if (typeof body.name === "string" && body.name.trim()) { data.name = body.name.trim(); editorial = true; }
  if ("vendor" in body) { data.vendor = body.vendor || null; editorial = true; }
  if ("version" in body) { data.version = body.version || null; editorial = true; }
  if ("categoryId" in body) { data.categoryId = body.categoryId || null; }
  if (typeof body.body === "string") { data.body = body.body; editorial = true; }
  if ("links" in body) { data.links = body.links ?? null; editorial = true; }
  if ("supportInfo" in body) { data.supportInfo = body.supportInfo ?? null; editorial = true; }
  if (Array.isArray(body.tags)) { data.tags = body.tags.map(String); editorial = true; }
  if (Array.isArray(body.requiresCapabilities)) { data.requiresCapabilities = body.requiresCapabilities.map(String); }
  if (body.visibilityDefault && VIS.includes(body.visibilityDefault)) { data.visibilityDefault = body.visibilityDefault; }
  if (editorial) { data.schemaVersion = existing.schemaVersion + 1; }

  const updated = await prisma.softwareTemplate.update({ where: { id }, data });
  if (editorial) {
    await prisma.softwareInstance.updateMany({
      where: { templateId: id, syncState: { not: "DETACHED" } },
      data: { syncState: "DRIFTED" },
    });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPER_ADMIN", "MSP_ADMIN"].includes(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await prisma.softwareTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
