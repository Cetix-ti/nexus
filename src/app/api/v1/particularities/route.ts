import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, ContentStatus, ContentSyncState } from "@prisma/client";

const VISIBILITY: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const STATUS: ContentStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];
const SYNC: ContentSyncState[] = ["IN_SYNC", "DRIFTED", "DETACHED"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const categoryId = searchParams.get("categoryId");
  const visibility = searchParams.get("visibility") as ContentVisibility | null;
  const status = searchParams.get("status") as ContentStatus | null;
  const syncState = searchParams.get("syncState") as ContentSyncState | null;
  const search = searchParams.get("search")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  const where: Record<string, unknown> = {};
  if (orgId) where.organizationId = orgId;
  if (categoryId) where.categoryId = categoryId;
  if (visibility && VISIBILITY.includes(visibility)) where.visibility = visibility;
  if (status && STATUS.includes(status)) where.status = status;
  if (syncState && SYNC.includes(syncState)) where.syncState = syncState;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
      { body: { contains: search, mode: "insensitive" } },
      { tags: { has: search.toLowerCase() } },
    ];
  }

  const items = await prisma.particularity.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true, icon: true, color: true } },
      author: { select: { id: true, firstName: true, lastName: true } },
      template: { select: { id: true, title: true, version: true } },
      _count: { select: { versions: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    organizationId,
    title,
    categoryId,
    summary,
    body: content,
    tags,
    visibility,
    templateId,
    resolvedVariables,
  } = body ?? {};

  if (!organizationId || typeof organizationId !== "string") {
    return NextResponse.json({ error: "organizationId requis" }, { status: 400 });
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title requis" }, { status: 400 });
  }

  let templateVersion: number | null = null;
  if (templateId) {
    const tpl = await prisma.particularityTemplate.findUnique({
      where: { id: templateId },
      select: { version: true },
    });
    templateVersion = tpl?.version ?? null;
  }

  const created = await prisma.particularity.create({
    data: {
      organizationId,
      title: title.trim(),
      categoryId: categoryId || null,
      summary: summary || null,
      body: content || "",
      tags: Array.isArray(tags) ? tags.map((t: unknown) => String(t)).filter(Boolean) : [],
      visibility: VISIBILITY.includes(visibility) ? visibility : "INTERNAL",
      templateId: templateId || null,
      templateVersion,
      resolvedVariables: resolvedVariables ?? null,
      authorId: me.id,
      updatedByUserId: me.id,
    },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true, icon: true, color: true } },
    },
  });

  // Snapshot v1
  await prisma.particularityVersion.create({
    data: {
      particularityId: created.id,
      version: 1,
      snapshot: {
        title: created.title,
        summary: created.summary,
        body: created.body,
        categoryId: created.categoryId,
        tags: created.tags,
        visibility: created.visibility,
        resolvedVariables: created.resolvedVariables,
      },
      authorId: me.id,
      changeNote: "Création",
    },
  });

  return NextResponse.json(created, { status: 201 });
}
