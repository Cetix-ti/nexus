import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

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
  const allow = [
    "title", "description", "kind", "allDay", "ownerId", "location",
    "organizationId", "renewalType", "renewalAmount", "renewalNotifyDaysBefore",
    "renewalExternalRef", "leaveType", "leaveApproved", "recurrence",
    "internalTicketId", "internalProjectId", "status",
  ];
  for (const k of allow) if (k in body) data[k] = body[k];
  if (body.startsAt) data.startsAt = new Date(body.startsAt);
  if (body.endsAt) data.endsAt = new Date(body.endsAt);
  if (body.recurrenceEndDate) data.recurrenceEndDate = new Date(body.recurrenceEndDate);

  const updated = await prisma.calendarEvent.update({
    where: { id },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
