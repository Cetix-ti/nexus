import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/** GET — list collaborators for a ticket */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const collaborators = await prisma.ticketCollaborator.findMany({
    where: { ticketId: id },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true, role: true },
      },
    },
    orderBy: { addedAt: "asc" },
  });

  return NextResponse.json({
    success: true,
    data: collaborators.map((c) => ({
      id: c.id,
      userId: c.userId,
      role: c.role,
      addedAt: c.addedAt.toISOString(),
      user: {
        id: c.user.id,
        name: `${c.user.firstName} ${c.user.lastName}`,
        email: c.user.email,
        avatar: c.user.avatar,
        role: c.user.role,
      },
    })),
  });
}

/** POST — add a collaborator to a ticket */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  if (!body.userId) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 });
  }

  // Verify ticket exists
  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  // Check if already a collaborator
  const existing = await prisma.ticketCollaborator.findUnique({
    where: { ticketId_userId: { ticketId: id, userId: body.userId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Déjà collaborateur" }, { status: 409 });
  }

  const collaborator = await prisma.ticketCollaborator.create({
    data: {
      ticketId: id,
      userId: body.userId,
      role: body.role || "collaborator",
    },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true, role: true },
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: collaborator.id,
      userId: collaborator.userId,
      role: collaborator.role,
      addedAt: collaborator.addedAt.toISOString(),
      user: {
        id: collaborator.user.id,
        name: `${collaborator.user.firstName} ${collaborator.user.lastName}`,
        email: collaborator.user.email,
        avatar: collaborator.user.avatar,
      },
    },
  }, { status: 201 });
}

/** DELETE — remove a collaborator */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const collaboratorId = searchParams.get("collaboratorId");

  if (!collaboratorId) {
    return NextResponse.json({ error: "collaboratorId requis" }, { status: 400 });
  }

  await prisma.ticketCollaborator.delete({
    where: { id: collaboratorId },
  });

  return NextResponse.json({ success: true });
}
