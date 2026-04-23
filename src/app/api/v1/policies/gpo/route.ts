import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, GpoScope } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const SCOPES: GpoScope[] = ["COMPUTER", "USER", "MIXED"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const scope = searchParams.get("scope") as GpoScope | null;
  const search = searchParams.get("search")?.trim();
  const where: Record<string, unknown> = { archivedAt: null };
  if (categoryId) where.categoryId = categoryId;
  if (scope && SCOPES.includes(scope)) where.scope = scope;
  if (search) where.OR = [
    { nameStem: { contains: search, mode: "insensitive" } },
    { nameOverride: { contains: search, mode: "insensitive" } },
    { description: { contains: search, mode: "insensitive" } },
  ];
  const items = await prisma.gpoTemplate.findMany({
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
  const nameStem = String(body?.nameStem ?? "").trim();
  const scope = body?.scope as GpoScope;
  if (!nameStem || !SCOPES.includes(scope)) {
    return NextResponse.json({ error: "nameStem et scope requis" }, { status: 400 });
  }
  const created = await prisma.gpoTemplate.create({
    data: {
      nameStem,
      nameOverride: body?.nameOverride || null,
      scope,
      categoryId: body?.categoryId || null,
      description: body?.description || null,
      body: body?.body || "",
      deploymentProcedure: body?.deploymentProcedure || null,
      variables: body?.variables ?? null,
      dependencies: body?.dependencies ?? null,
      tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
      requiresCapabilities: Array.isArray(body?.requiresCapabilities) ? body.requiresCapabilities.map(String) : ["hasAD"],
      visibilityDefault: VIS.includes(body?.visibilityDefault) ? body.visibilityDefault : "INTERNAL",
      createdByUserId: me.id,
      updatedByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
