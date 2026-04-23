import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, GpoScope } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const SCOPES: GpoScope[] = ["COMPUTER", "USER", "MIXED"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.gpoTemplate.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      instances: {
        select: {
          id: true, organizationId: true, computedName: true, status: true, syncState: true, templateSchemaVersion: true,
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
  const existing = await prisma.gpoTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { updatedByUserId: me.id };
  let editorial = false;
  if (typeof body.nameStem === "string" && body.nameStem.trim()) { data.nameStem = body.nameStem.trim(); editorial = true; }
  if ("nameOverride" in body) { data.nameOverride = body.nameOverride || null; editorial = true; }
  if (body.scope && SCOPES.includes(body.scope)) { data.scope = body.scope; editorial = true; }
  if ("categoryId" in body) data.categoryId = body.categoryId || null;
  if ("description" in body) { data.description = body.description || null; editorial = true; }
  if (typeof body.body === "string") { data.body = body.body; editorial = true; }
  if ("deploymentProcedure" in body) { data.deploymentProcedure = body.deploymentProcedure || null; editorial = true; }
  if ("variables" in body) { data.variables = body.variables ?? null; editorial = true; }
  if ("dependencies" in body) { data.dependencies = body.dependencies ?? null; editorial = true; }
  if (Array.isArray(body.tags)) data.tags = body.tags.map(String);
  if (Array.isArray(body.requiresCapabilities)) data.requiresCapabilities = body.requiresCapabilities.map(String);
  if (body.visibilityDefault && VIS.includes(body.visibilityDefault)) data.visibilityDefault = body.visibilityDefault;
  if (editorial) data.schemaVersion = existing.schemaVersion + 1;

  const updated = await prisma.gpoTemplate.update({ where: { id }, data });
  if (editorial) {
    await prisma.gpoInstance.updateMany({
      where: { templateId: id, syncState: { not: "DETACHED" } },
      data: { syncState: "DRIFTED" },
    });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPER_ADMIN", "MSP_ADMIN"].includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  await prisma.gpoTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
