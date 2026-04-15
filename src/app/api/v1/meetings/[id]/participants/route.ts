import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole, type UserRole } from "@/lib/auth-utils";

async function assertCanMutate(
  meetingId: string,
  me: { id: string; role: UserRole },
): Promise<string | null> {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      createdById: true,
      participants: { select: { userId: true } },
    },
  });
  if (!m) return "Not found";
  const isCreator = m.createdById === me.id;
  const isParticipant = m.participants.some((p) => p.userId === me.id);
  const isSupervisor = hasMinimumRole(me.role, "SUPERVISOR");
  if (!isCreator && !isParticipant && !isSupervisor) return "Forbidden";
  return null;
}

/** POST — add one or many participants */
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
  const forbidden = await assertCanMutate(id, me);
  if (forbidden === "Not found") return NextResponse.json({ error: forbidden }, { status: 404 });
  if (forbidden) return NextResponse.json({ error: forbidden }, { status: 403 });

  const body = await req.json();
  const userIds: string[] = Array.isArray(body.userIds)
    ? body.userIds
    : body.userId
    ? [body.userId]
    : [];
  if (userIds.length === 0) {
    return NextResponse.json({ error: "userIds requis" }, { status: 400 });
  }
  const role =
    body.role && ["organizer", "attendee", "optional"].includes(body.role)
      ? body.role
      : "attendee";

  // Dedup contre les existants
  const existing = await prisma.meetingParticipant.findMany({
    where: { meetingId: id, userId: { in: userIds } },
    select: { userId: true },
  });
  const already = new Set(existing.map((p) => p.userId));
  const toCreate = userIds.filter((u) => !already.has(u));

  if (toCreate.length > 0) {
    await prisma.meetingParticipant.createMany({
      data: toCreate.map((userId) => ({ meetingId: id, userId, role })),
      skipDuplicates: true,
    });
  }

  const participants = await prisma.meetingParticipant.findMany({
    where: { meetingId: id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
    },
  });
  return NextResponse.json({ participants, added: toCreate.length });
}

/** PATCH — update a participant (role / attended flag).
 *  Body: { userId, role?, attended? } */
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
  const forbidden = await assertCanMutate(id, me);
  if (forbidden === "Not found") return NextResponse.json({ error: forbidden }, { status: 404 });
  if (forbidden) return NextResponse.json({ error: forbidden }, { status: 403 });

  const body = await req.json();
  if (!body.userId) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if ("role" in body) {
    if (!["organizer", "attendee", "optional"].includes(body.role)) {
      return NextResponse.json({ error: "role invalide" }, { status: 400 });
    }
    data.role = body.role;
  }
  if ("attended" in body) data.attended = body.attended;

  const updated = await prisma.meetingParticipant.update({
    where: { meetingId_userId: { meetingId: id, userId: body.userId } },
    data,
  });
  return NextResponse.json(updated);
}

/** DELETE /api/v1/meetings/[id]/participants?userId=... */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const forbidden = await assertCanMutate(id, me);
  if (forbidden === "Not found") return NextResponse.json({ error: forbidden }, { status: 404 });
  if (forbidden) return NextResponse.json({ error: forbidden }, { status: 403 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 });
  }
  await prisma.meetingParticipant.delete({
    where: { meetingId_userId: { meetingId: id, userId } },
  });
  return NextResponse.json({ ok: true });
}
