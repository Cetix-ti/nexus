import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search")?.trim();

  const where: Record<string, unknown> = {};
  if (orgId) where.organizationId = orgId;
  if (categoryId) where.categoryId = categoryId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { vendor: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await prisma.softwareInstance.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, icon: true, color: true } },
      template: { select: { id: true, name: true, schemaVersion: true } },
      responsibleClientContact: { select: { id: true, firstName: true, lastName: true } },
      responsibleCetixUser: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { installers: true, licenses: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const organizationId = String(body?.organizationId ?? "");
  const name = String(body?.name ?? "").trim();
  if (!organizationId || !name) return NextResponse.json({ error: "organizationId et name requis" }, { status: 400 });

  let templateSchemaVersion: number | null = null;
  let inherited: { vendor: string | null; version: string | null; body: string; categoryId: string | null } | null = null;
  if (body?.templateId) {
    const tpl = await prisma.softwareTemplate.findUnique({
      where: { id: body.templateId },
      select: { schemaVersion: true, vendor: true, version: true, body: true, categoryId: true, visibilityDefault: true },
    });
    if (tpl) {
      templateSchemaVersion = tpl.schemaVersion;
      inherited = { vendor: tpl.vendor, version: tpl.version, body: tpl.body, categoryId: tpl.categoryId };
    }
  }

  const created = await prisma.softwareInstance.create({
    data: {
      organizationId,
      templateId: body?.templateId || null,
      templateSchemaVersion,
      name,
      vendor: body?.vendor ?? inherited?.vendor ?? null,
      version: body?.version ?? inherited?.version ?? null,
      categoryId: body?.categoryId ?? inherited?.categoryId ?? null,
      bodyOverride: body?.bodyOverride ?? null,
      links: body?.links ?? null,
      supportInfo: body?.supportInfo ?? null,
      tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
      visibility: VIS.includes(body?.visibility) ? body.visibility : "INTERNAL",
      responsibleClientContactId: body?.responsibleClientContactId || null,
      responsibleCetixUserId: body?.responsibleCetixUserId || null,
      allowEnglishUI: typeof body?.allowEnglishUI === "boolean" ? body.allowEnglishUI : null,
      updatedByUserId: me.id,
    },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, icon: true, color: true } },
      template: { select: { id: true, name: true, schemaVersion: true } },
    },
  });
  return NextResponse.json(created, { status: 201 });
}
