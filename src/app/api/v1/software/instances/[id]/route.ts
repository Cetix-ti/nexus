import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, ContentStatus } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const STATUS: ContentStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.softwareInstance.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, icon: true, color: true } },
      template: { select: { id: true, name: true, schemaVersion: true, body: true, vendor: true, version: true } },
      responsibleClientContact: { select: { id: true, firstName: true, lastName: true, email: true } },
      responsibleCetixUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      installers: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { downloadLinks: true } } },
      },
      licenses: { orderBy: { endDate: "asc" } },
      updatedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Recalcul syncState
  if (item.templateId && item.template && item.syncState !== "DETACHED") {
    const expected = item.templateSchemaVersion === item.template.schemaVersion ? "IN_SYNC" : "DRIFTED";
    if (expected !== item.syncState) {
      await prisma.softwareInstance.update({ where: { id }, data: { syncState: expected } });
      item.syncState = expected;
    }
  }
  return NextResponse.json(item);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const existing = await prisma.softwareInstance.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { updatedByUserId: me.id };
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("vendor" in body) data.vendor = body.vendor || null;
  if ("version" in body) data.version = body.version || null;
  if ("categoryId" in body) data.categoryId = body.categoryId || null;
  if ("bodyOverride" in body) data.bodyOverride = body.bodyOverride || null;
  if ("links" in body) data.links = body.links ?? null;
  if ("supportInfo" in body) data.supportInfo = body.supportInfo ?? null;
  if (Array.isArray(body.tags)) data.tags = body.tags.map(String);
  if (body.visibility && VIS.includes(body.visibility)) data.visibility = body.visibility;
  if (body.status && STATUS.includes(body.status)) data.status = body.status;
  if ("responsibleClientContactId" in body) data.responsibleClientContactId = body.responsibleClientContactId || null;
  if ("responsibleCetixUserId" in body) data.responsibleCetixUserId = body.responsibleCetixUserId || null;
  if ("allowEnglishUI" in body) data.allowEnglishUI = typeof body.allowEnglishUI === "boolean" ? body.allowEnglishUI : null;
  if (body.detachFromTemplate === true && existing.templateId) data.syncState = "DETACHED";
  if (body.realignToTemplate === true && existing.templateId) {
    const tpl = await prisma.softwareTemplate.findUnique({ where: { id: existing.templateId } });
    if (tpl) { data.templateSchemaVersion = tpl.schemaVersion; data.syncState = "IN_SYNC"; }
  }

  const updated = await prisma.softwareInstance.update({
    where: { id },
    data,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, icon: true, color: true } },
      template: { select: { id: true, name: true, schemaVersion: true } },
      responsibleClientContact: { select: { id: true, firstName: true, lastName: true } },
      responsibleCetixUser: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.softwareInstance.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
