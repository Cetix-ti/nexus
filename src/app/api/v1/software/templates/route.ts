import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search")?.trim();

  const where: Record<string, unknown> = { archivedAt: null };
  if (categoryId) where.categoryId = categoryId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { vendor: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await prisma.softwareTemplate.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      _count: { select: { instances: true, installers: true, licenses: true } },
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
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name requis" }, { status: 400 });
  const created = await prisma.softwareTemplate.create({
    data: {
      name,
      vendor: body?.vendor || null,
      version: body?.version || null,
      categoryId: body?.categoryId || null,
      body: body?.body || "",
      links: body?.links ?? null,
      supportInfo: body?.supportInfo ?? null,
      tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
      requiresCapabilities: Array.isArray(body?.requiresCapabilities) ? body.requiresCapabilities.map(String) : [],
      visibilityDefault: VIS.includes(body?.visibilityDefault) ? body.visibilityDefault : "INTERNAL",
      createdByUserId: me.id,
      updatedByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
