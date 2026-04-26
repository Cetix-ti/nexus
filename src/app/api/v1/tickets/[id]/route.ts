import { NextResponse } from "next/server";
import { getTicket, updateTicket, deleteTicket, parseTicketIdentifier } from "@/lib/tickets/service";
import { getCurrentUser } from "@/lib/auth-utils";
import { userCanAccessOrg } from "@/lib/auth/org-scope";
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
  // Scoping Phase 9 : si l'user est limité à certaines orgs, vérifie que
  // ce ticket appartient à l'une d'elles. Sinon 404 (et non 403) pour
  // ne pas leak l'existence du ticket.
  if (ticket.organizationId && !(await userCanAccessOrg(me.id, me.role, ticket.organizationId))) {
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
  // Scoping Phase 9 : pas de modification d'un ticket hors scope.
  const orgRow = await prisma.ticket.findUnique({
    where: { id: cuid },
    select: { organizationId: true },
  });
  if (orgRow && !(await userCanAccessOrg(me.id, me.role, orgRow.organizationId))) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }
  const body = await req.json();

  // Blocage par dépendance : si on tente de faire avancer un ticket hors
  // des statuts "parking" (NEW, OPEN, PENDING…) alors qu'un upstream n'est
  // pas RESOLVED/CLOSED, on refuse. L'utilisateur doit d'abord fermer le
  // ou les tickets amont (ou retirer la dépendance).
  if (body?.status) {
    const activeStatuses = new Set(["in_progress", "on_site", "scheduled"]);
    if (activeStatuses.has(String(body.status).toLowerCase())) {
      const prisma = (await import("@/lib/prisma")).default;
      const deps = await prisma.ticketDependency.findMany({
        where: { ticketId: cuid },
        include: { upstream: { select: { number: true, status: true } } },
      });
      const pending = deps.filter(
        (d) => !["RESOLVED", "CLOSED"].includes(d.upstream.status.toUpperCase()),
      );
      if (pending.length > 0) {
        return NextResponse.json(
          {
            error: "Ticket bloqué par des dépendances non résolues.",
            pendingUpstreams: pending.map((d) => ({
              number: d.upstream.number,
              status: d.upstream.status,
            })),
          },
          { status: 409 },
        );
      }
    }
  }

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
  // Scoping Phase 9 : pas de suppression d'un ticket hors scope.
  const orgRow = await prisma.ticket.findUnique({
    where: { id: cuid },
    select: { organizationId: true },
  });
  if (orgRow && !(await userCanAccessOrg(me.id, me.role, orgRow.organizationId))) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }
  await deleteTicket(cuid);
  return NextResponse.json({ ok: true });
}
