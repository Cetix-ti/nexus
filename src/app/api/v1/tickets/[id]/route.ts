import { NextResponse } from "next/server";
import { getTicket, updateTicket, deleteTicket, parseTicketIdentifier } from "@/lib/tickets/service";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

/**
 * Résout l'identifiant URL (cuid OU "TK-NNNN"/"INT-NNNN") en cuid Prisma.
 * Renvoie null si introuvable. Centralise pour PATCH/DELETE qui prennent
 * le cuid directement et n'ont pas le système OR de findFirst.
 */
async function resolveCuid(input: string): Promise<string | null> {
  const ident = parseTicketIdentifier(input);
  if (ident.id) {
    const exists = await prisma.ticket.findUnique({
      where: { id: ident.id },
      select: { id: true },
    });
    return exists?.id ?? null;
  }
  if (ident.number !== undefined) {
    const t = await prisma.ticket.findUnique({
      where: { number: ident.number },
      select: { id: true },
    });
    return t?.id ?? null;
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: input } = await params;
  const cuid = await resolveCuid(input);
  if (!cuid) return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  const body = await req.json();
  const updated = await updateTicket(cuid, body, me.id);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: input } = await params;
  const cuid = await resolveCuid(input);
  if (!cuid) return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  await deleteTicket(cuid);
  return NextResponse.json({ ok: true });
}
