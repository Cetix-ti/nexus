import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cats = await prisma.particularityCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(cats);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPER_ADMIN", "MSP_ADMIN"].includes(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  const slug = String(body?.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (!name || !slug) return NextResponse.json({ error: "name et slug requis" }, { status: 400 });

  const created = await prisma.particularityCategory.create({
    data: {
      name,
      slug,
      icon: body?.icon || "📌",
      color: body?.color || "#3B82F6",
      description: body?.description || null,
      sortOrder: Number(body?.sortOrder ?? 500),
    },
  });
  return NextResponse.json(created, { status: 201 });
}
