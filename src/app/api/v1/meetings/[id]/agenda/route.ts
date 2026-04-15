import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/** POST — add an agenda item to the meeting */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  if (!body.title) {
    return NextResponse.json({ error: "title requis" }, { status: 400 });
  }
  const last = await prisma.meetingAgendaItem.findFirst({
    where: { meetingId: id },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const created = await prisma.meetingAgendaItem.create({
    data: {
      meetingId: id,
      title: body.title,
      description: body.description ?? null,
      addedById: me.id,
      order: (last?.order ?? -1) + 1,
      durationMinutes: body.durationMinutes ?? null,
    },
    include: {
      addedBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
    },
  });
  return NextResponse.json(created, { status: 201 });
}
