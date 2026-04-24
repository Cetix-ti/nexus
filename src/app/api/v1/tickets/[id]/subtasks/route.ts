// ============================================================================
// /api/v1/tickets/[id]/subtasks — CRUD des sous-tâches d'un ticket.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const rows = await prisma.ticketSubtask.findMany({
    where: { ticketId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.title) return NextResponse.json({ error: "title requis" }, { status: 400 });

  const last = await prisma.ticketSubtask.findFirst({
    where: { ticketId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const row = await prisma.ticketSubtask.create({
    data: {
      ticketId: id,
      title: String(body.title).trim(),
      sortOrder,
    },
  });
  return NextResponse.json({ data: row });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.subtaskId) return NextResponse.json({ error: "subtaskId requis" }, { status: 400 });

  const existing = await prisma.ticketSubtask.findUnique({
    where: { id: String(body.subtaskId) },
    select: { ticketId: true, done: true },
  });
  if (!existing || existing.ticketId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.done !== undefined) {
    data.done = !!body.done;
    data.doneAt = body.done ? new Date() : null;
    data.doneById = body.done ? me.id : null;
  }
  const row = await prisma.ticketSubtask.update({
    where: { id: String(body.subtaskId) },
    data,
  });
  return NextResponse.json({ data: row });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const subtaskId = req.nextUrl.searchParams.get("subtaskId");
  if (!subtaskId) return NextResponse.json({ error: "subtaskId requis" }, { status: 400 });
  await prisma.ticketSubtask.deleteMany({
    where: { id: subtaskId, ticketId: id },
  });
  return NextResponse.json({ success: true });
}
