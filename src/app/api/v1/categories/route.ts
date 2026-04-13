import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      parentId: true,
      description: true,
      icon: true,
      sortOrder: true,
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

  const category = await prisma.category.create({
    data: {
      name: body.name.trim(),
      parentId: body.parentId || null,
      description: body.description || null,
      icon: body.icon || null,
      sortOrder: body.sortOrder ?? 0,
      organizationId: body.organizationId || null,
    },
  });

  return NextResponse.json(category, { status: 201 });
}
