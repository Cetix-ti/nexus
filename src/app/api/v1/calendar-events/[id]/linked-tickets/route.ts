import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";

/**
 * Normalise un id d'occurrence récurrente "xxx@ISO" vers l'event-source.
 */
function normalizeEventId(raw: string): string {
  const at = raw.indexOf("@");
  return at >= 0 ? raw.slice(0, at) : raw;
}

/**
 * GET /api/v1/calendar-events/[id]/linked-tickets
 *
 * Retourne deux listes :
 *   - linked        : tickets actuellement attachés à cet événement ET
 *                     toujours pertinents (requiresOnSite=true + pas clos).
 *   - clientOnSite  : autres tickets "à faire sur place" du même client,
 *                     non encore liés, que l'utilisateur peut ajouter.
 *                     Seulement si l'événement a une organizationId.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const eventId = normalizeEventId(rawId);
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { id: true, organizationId: true },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const linked = await prisma.ticket.findMany({
    where: {
      calendarEventId: eventId,
      requiresOnSite: true,
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      priority: true,
      isInternal: true,
      organizationId: true,
      assignee: { select: { firstName: true, lastName: true, avatar: true } },
    },
    // ASC car l'enum TicketPriority est CRITICAL → ... → LOW.
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  let clientOnSite: typeof linked = [];
  if (event.organizationId) {
    clientOnSite = await prisma.ticket.findMany({
      where: {
        organizationId: event.organizationId,
        requiresOnSite: true,
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
        // Exclut les tickets déjà liés à CET événement.
        NOT: { calendarEventId: eventId },
      },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        isInternal: true,
        organizationId: true,
        calendarEventId: true,
        assignee: { select: { firstName: true, lastName: true, avatar: true } },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
  }

  // Attache un displayNumber (TK-xxxx / INT-xxxx) à chaque ticket pour
  // que le front n'ait plus à deviner le préfixe. Le préfixe client est
  // configurable via /settings (tenant-setting tickets.numberingPrefix).
  const clientPrefix = await getClientTicketPrefix();
  const withDisplay = <T extends { number: number; isInternal?: boolean | null }>(t: T) => ({
    ...t,
    displayNumber: formatTicketNumber(t.number, !!t.isInternal, clientPrefix),
  });
  return NextResponse.json({
    linked: linked.map(withDisplay),
    clientOnSite: clientOnSite.map(withDisplay),
  });
}

/**
 * POST /api/v1/calendar-events/[id]/linked-tickets
 * Body: { ticketIds: string[] }
 *
 * Attache les tickets listés à cet événement (update de Ticket.calendarEventId).
 * Idempotent : re-linker un ticket déjà lié ne fait rien. Forcé
 * requiresOnSite=true côté ticket s'il ne l'était pas (cohérence métier :
 * on ne peut lier un ticket à une visite que si ce ticket est "à faire sur
 * place").
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const eventId = normalizeEventId(rawId);

  const body = await req.json();
  const ticketIds: string[] = Array.isArray(body.ticketIds) ? body.ticketIds : [];
  if (ticketIds.length === 0) {
    return NextResponse.json({ error: "ticketIds requis" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { id: true, organizationId: true },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Vérifie que tous les tickets existent et qu'ils appartiennent au bon
  // client (si l'event a un organizationId fixé).
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, organizationId: true },
  });
  if (tickets.length !== ticketIds.length) {
    return NextResponse.json({ error: "Ticket(s) introuvable(s)" }, { status: 404 });
  }
  if (event.organizationId) {
    const wrongOrg = tickets.find((t) => t.organizationId !== event.organizationId);
    if (wrongOrg) {
      return NextResponse.json(
        { error: "Un ticket n'appartient pas au client de l'événement" },
        { status: 400 },
      );
    }
  }

  // Met à jour tout le lot en une seule commande.
  await prisma.ticket.updateMany({
    where: { id: { in: ticketIds } },
    data: { calendarEventId: eventId, requiresOnSite: true },
  });

  return NextResponse.json({ linked: ticketIds.length });
}

/**
 * DELETE /api/v1/calendar-events/[id]/linked-tickets?ticketId=xxx
 * Retire le lien sans supprimer le ticket.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const eventId = normalizeEventId(rawId);
  const ticketId = new URL(req.url).searchParams.get("ticketId");
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId requis" }, { status: 400 });
  }

  // Ne retire que si le ticket est bien lié à CET event (sécurité).
  const updated = await prisma.ticket.updateMany({
    where: { id: ticketId, calendarEventId: eventId },
    data: { calendarEventId: null },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Lien introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
