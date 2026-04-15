import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { itemId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["title", "description", "notes", "status", "order", "durationMinutes"]) {
    if (k in body) data[k] = body[k];
  }
  if (typeof data.title === "string") {
    const trimmed = data.title.trim();
    if (!trimmed) return NextResponse.json({ error: "Titre vide" }, { status: 400 });
    data.title = trimmed;
  }
  if ("status" in data) {
    const allowed = ["pending", "in_progress", "done", "deferred"];
    if (!allowed.includes(data.status as string)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }
  }
  const updated = await prisma.meetingAgendaItem.update({
    where: { id: itemId },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { itemId } = await params;
  await prisma.meetingAgendaItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}
