import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility } from "@prisma/client";

const VISIBILITY: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.particularityTemplate.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      instances: {
        select: {
          id: true,
          title: true,
          organizationId: true,
          syncState: true,
          templateVersion: true,
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
  const existing = await prisma.particularityTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { updatedByUserId: me.id };
  let editorial = false;
  if (typeof body.title === "string" && body.title.trim()) { data.title = body.title.trim(); editorial = true; }
  if ("summary" in body) { data.summary = body.summary || null; editorial = true; }
  if (typeof body.body === "string") { data.body = body.body; editorial = true; }
  if ("categoryId" in body) { data.categoryId = body.categoryId || null; }
  if (Array.isArray(body.tags)) { data.tags = body.tags.map(String); editorial = true; }
  if ("variables" in body) { data.variables = body.variables ?? null; editorial = true; }
  if (Array.isArray(body.requiresCapabilities)) { data.requiresCapabilities = body.requiresCapabilities.map(String); }
  if (body.visibilityDefault && VISIBILITY.includes(body.visibilityDefault)) { data.visibilityDefault = body.visibilityDefault; }
  if (editorial) { data.version = existing.version + 1; }

  const updated = await prisma.particularityTemplate.update({ where: { id }, data });

  // Si version bump, marquer toutes les instances non DETACHED comme DRIFTED
  if (editorial) {
    await prisma.particularity.updateMany({
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
  await prisma.particularityTemplate.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
