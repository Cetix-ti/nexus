import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole, type UserRole } from "@/lib/auth-utils";

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

async function assertCanMutateMeeting(
  meetingId: string,
  me: { id: string; role: UserRole },
): Promise<string | null> {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { createdById: true, participants: { select: { userId: true } } },
  });
  if (!m) return "Not found";
  const isCreator = m.createdById === me.id;
  const isParticipant = m.participants.some((p) => p.userId === me.id);
  const isSupervisor = hasMinimumRole(me.role, "SUPERVISOR");
  // Créateurs + participants + supervisors peuvent éditer (notes d'équipe).
  // Un observateur qui ne participe pas n'édite pas.
  if (!isCreator && !isParticipant && !isSupervisor) return "Forbidden";
  return null;
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
  const forbidden = await assertCanMutateMeeting(id, me);
  if (forbidden === "Not found") return NextResponse.json({ error: forbidden }, { status: 404 });
  if (forbidden) return NextResponse.json({ error: forbidden }, { status: 403 });

  const body = await req.json();

  const data: Record<string, unknown> = {};
  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "Titre vide" }, { status: 400 });
    }
    data.title = body.title.trim();
  }
  if ("description" in body) data.description = body.description;
  if ("location" in body) data.location = body.location;
  if ("status" in body) {
    const allowed = ["scheduled", "in_progress", "completed", "cancelled"];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }
    data.status = body.status;
  }
  let startsAtDate: Date | undefined;
  let endsAtDate: Date | undefined;
  if (body.startsAt) {
    startsAtDate = new Date(body.startsAt);
    if (Number.isNaN(startsAtDate.getTime())) {
      return NextResponse.json({ error: "startsAt invalide" }, { status: 400 });
    }
    data.startsAt = startsAtDate;
  }
  if (body.endsAt) {
    endsAtDate = new Date(body.endsAt);
    if (Number.isNaN(endsAtDate.getTime())) {
      return NextResponse.json({ error: "endsAt invalide" }, { status: 400 });
    }
    data.endsAt = endsAtDate;
  }
  if (startsAtDate && endsAtDate && endsAtDate <= startsAtDate) {
    return NextResponse.json({ error: "La fin doit être après le début" }, { status: 400 });
  }
  if ("notes" in body) {
    data.notes = body.notes;
    data.notesUpdatedAt = new Date();
  }

  const updated = await prisma.meeting.update({
    where: { id },
    data,
  });

  // Synchronise l'event calendar lié si le titre/horaire changent — sinon
  // l'event du calendrier diverge de la fiche réunion.
  if ("title" in data || "startsAt" in data || "endsAt" in data || "location" in data) {
    const syncData: Record<string, unknown> = {};
    if ("title" in data) syncData.title = data.title;
    if ("startsAt" in data) syncData.startsAt = data.startsAt;
    if ("endsAt" in data) syncData.endsAt = data.endsAt;
    if ("location" in data) syncData.location = data.location;
    await prisma.calendarEvent.updateMany({
      where: { meetingId: id },
      data: syncData,
    });
  }

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
  const m = await prisma.meeting.findUnique({
    where: { id },
    select: { createdById: true },
  });
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isCreator = m.createdById === me.id;
  const isSupervisor = hasMinimumRole(me.role, "SUPERVISOR");
  if (!isCreator && !isSupervisor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Agenda + participants cascade (définis dans le schéma).
  // CalendarEvent cascade aussi grâce au onDelete: Cascade que je viens
  // d'ajouter. Les tickets internes reliés perdent juste leur meetingId
  // (onDelete: SetNull) — on ne les supprime pas, ils ont leur vie propre.
  await prisma.meeting.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
