import { NextResponse } from "next/server";
import { getTicket, updateTicket, deleteTicket } from "@/lib/tickets/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }
  return NextResponse.json(ticket);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updated = await updateTicket(id, body);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteTicket(id);
  return NextResponse.json({ ok: true });
}
