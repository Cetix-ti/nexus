import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { CategoryScope } from "@prisma/client";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Filtrage par scope : `?scope=CLIENT` ou `?scope=INTERNAL`.
  // Sans paramètre, retourne tout (backward-compat avec callers qui ne
  // connaissent pas le scope, ex: vues admin globales).
  const scopeParam = req.nextUrl.searchParams.get("scope");
  const scope: CategoryScope | undefined =
    scopeParam === "CLIENT" || scopeParam === "INTERNAL" ? scopeParam : undefined;

  const categories = await prisma.category.findMany({
    where: {
      isActive: true,
      ...(scope ? { scope } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      parentId: true,
      description: true,
      icon: true,
      sortOrder: true,
      scope: true,
    },
  });

  return NextResponse.json(categories);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Le nom est requis" }, { status: 400 });
  }

  // Cohérence d'arbre : si parentId fourni, hérite du scope du parent.
  // Sinon, le scope vient du body (default CLIENT si non fourni).
  let scope: CategoryScope = body.scope === "INTERNAL" ? "INTERNAL" : "CLIENT";
  if (body.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: body.parentId },
      select: { scope: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Catégorie parente introuvable" }, { status: 400 });
    }
    scope = parent.scope;
  }

  const category = await prisma.category.create({
    data: {
      name: body.name.trim(),
      parentId: body.parentId || null,
      description: body.description || null,
      icon: body.icon || null,
      sortOrder: body.sortOrder ?? 0,
      scope,
      organizationId: body.organizationId || null,
    },
  });

  return NextResponse.json(category, { status: 201 });
}
