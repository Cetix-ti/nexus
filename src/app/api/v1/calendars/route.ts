import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

/** GET — list active calendars */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const calendars = await prisma.calendar.findMany({
    where: { isActive: true },
    orderBy: { kind: "asc" },
  });
  return NextResponse.json(calendars);
}

/** POST — create a new custom calendar (MSP_ADMIN+) */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!body.name) {
    return NextResponse.json({ error: "name requis" }, { status: 400 });
  }
  const created = await prisma.calendar.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      kind: body.kind ?? "CUSTOM",
      color: body.color ?? "#3B82F6",
      visibility: body.visibility ?? "team",
      createdById: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
