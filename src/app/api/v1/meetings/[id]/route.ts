import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      agenda: {
        include: {
          addedBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
        orderBy: { order: "asc" },
      },
      participants: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true } },
        },
      },
      generatedTickets: {
        select: { id: true, number: true, subject: true, status: true, priority: true, assigneeId: true, isInternal: true },
      },
    },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(meeting);
}

export async function PATCH(
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

  const data: Record<string, unknown> = {};
  if ("title" in body) data.title = body.title;
  if ("description" in body) data.description = body.description;
  if ("location" in body) data.location = body.location;
  if ("status" in body) data.status = body.status;
  if (body.startsAt) data.startsAt = new Date(body.startsAt);
  if (body.endsAt) data.endsAt = new Date(body.endsAt);
  if ("notes" in body) {
    data.notes = body.notes;
    data.notesUpdatedAt = new Date();
  }

  const updated = await prisma.meeting.update({
    where: { id },
    data,
  });
  return NextResponse.json(updated);
}
