import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility } from "@prisma/client";

const VISIBILITY: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];

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
      { title: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await prisma.particularityTemplate.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      _count: { select: { instances: true } },
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
  const title = String(body?.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title requis" }, { status: 400 });

  const created = await prisma.particularityTemplate.create({
    data: {
      title,
      categoryId: body?.categoryId || null,
      summary: body?.summary || null,
      body: body?.body || "",
      tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
      variables: body?.variables ?? null,
      requiresCapabilities: Array.isArray(body?.requiresCapabilities) ? body.requiresCapabilities.map(String) : [],
      visibilityDefault: VISIBILITY.includes(body?.visibilityDefault) ? body.visibilityDefault : "INTERNAL",
      createdByUserId: me.id,
      updatedByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
