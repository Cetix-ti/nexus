import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const queues = await prisma.queue.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      isDefault: true,
    },
  });

  return NextResponse.json(queues);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Le nom est requis" }, { status: 400 });
  }

  const queue = await prisma.queue.create({
    data: {
      name: body.name.trim(),
      description: body.description || null,
      isDefault: body.isDefault ?? false,
      organizationId: body.organizationId || null,
    },
  });

  return NextResponse.json(queue, { status: 201 });
}
