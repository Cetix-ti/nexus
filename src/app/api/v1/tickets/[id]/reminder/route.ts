import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET — get active reminder for this ticket + current user
export async function GET(_req: Request, ctx: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const reminder = await prisma.ticketReminder.findUnique({
    where: { ticketId_userId: { ticketId: id, userId: me.id } },
  });

  return NextResponse.json(reminder ?? null);
}

// POST — create or update a reminder
export async function POST(req: Request, ctx: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json();

  if (!body.remindAt) {
    return NextResponse.json(
      { error: "Le champ 'remindAt' est requis" },
      { status: 422 },
    );
  }

  const remindAt = new Date(body.remindAt);
  if (isNaN(remindAt.getTime()) || remindAt <= new Date()) {
    return NextResponse.json(
      { error: "La date du rappel doit être dans le futur" },
      { status: 422 },
    );
  }

  // Verify ticket exists
  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  const reminder = await prisma.ticketReminder.upsert({
    where: { ticketId_userId: { ticketId: id, userId: me.id } },
    update: {
      remindAt,
      note: body.note || null,
      notifiedAt: null, // reset notification if date changed
    },
    create: {
      ticketId: id,
      userId: me.id,
      remindAt,
      note: body.note || null,
    },
  });

  return NextResponse.json(reminder, { status: 201 });
}

// DELETE — remove a reminder
export async function DELETE(_req: Request, ctx: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  await prisma.ticketReminder.deleteMany({
    where: { ticketId: id, userId: me.id },
  });

  return NextResponse.json({ ok: true });
}
