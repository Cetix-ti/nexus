import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const cats = await prisma.assetCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(cats);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name requis" }, { status: 400 });
  }
  try {
    const cat = await prisma.assetCategory.create({
      data: {
        name: body.name.trim(),
        description: body.description,
        icon: body.icon || "📦",
        color: body.color || "#3B82F6",
      },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
