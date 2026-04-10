import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId") || undefined;
  const rows = await prisma.contract.findMany({
    where: orgId ? { organizationId: orgId } : undefined,
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(
    rows.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      startDate: c.startDate.toISOString(),
      endDate: c.endDate?.toISOString() || null,
      monthlyHours: c.monthlyHours,
      hourlyRate: c.hourlyRate,
      notes: c.notes,
    }))
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name || !body.organizationId || !body.startDate) {
    return NextResponse.json({ error: "name, organizationId, startDate requis" }, { status: 400 });
  }
  const created = await prisma.contract.create({
    data: {
      organizationId: body.organizationId,
      name: body.name,
      type: (body.type || "SUPPORT").toUpperCase(),
      status: (body.status || "ACTIVE").toUpperCase(),
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      monthlyHours: body.monthlyHours,
      hourlyRate: body.hourlyRate,
      notes: body.notes,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
