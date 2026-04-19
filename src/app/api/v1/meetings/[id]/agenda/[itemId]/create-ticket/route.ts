import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * POST /api/v1/meetings/[id]/agenda/[itemId]/create-ticket
 *
 * Crée un ticket interne rapide pour un point précis de l'ordre du jour.
 * Utilise le titre de l'item comme sujet et ses notes comme description
 * (avec un pied de page qui référence la rencontre pour la traçabilité).
 *
 * Body (optionnel) : { priority?, assigneeId? }
 *
 * Même logique que create-tickets (bulk) : ticket INTERNE attaché à
 * l'organisation marquée `isInternal=true`, lié au meeting via meetingId.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: meetingId, itemId } = await params;

  const item = await prisma.meetingAgendaItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      description: true,
      notes: true,
      meetingId: true,
      meeting: { select: { id: true, title: true } },
    },
  });
  if (!item || item.meetingId !== meetingId) {
    return NextResponse.json(
      { error: "Point d'ordre du jour introuvable" },
      { status: 404 },
    );
  }

  const internalOrg = await prisma.organization.findFirst({
    where: { isInternal: true },
    select: { id: true },
  });
  if (!internalOrg) {
    return NextResponse.json(
      {
        error:
          "Aucune organisation interne définie. Marque l'organisation Cetix comme interne dans Paramètres → Organisations.",
      },
      { status: 412 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const priorityMap: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
    low: "LOW",
    medium: "MEDIUM",
    high: "HIGH",
    critical: "CRITICAL",
  };
  const priority =
    priorityMap[String(body?.priority ?? "medium").toLowerCase()] ?? "MEDIUM";
  const assigneeId =
    typeof body?.assigneeId === "string" && body.assigneeId
      ? body.assigneeId
      : null;

  // Description = description de l'item (contexte pré-meeting) + notes
  // prises pendant la discussion, séparées clairement. Footer pour la
  // traçabilité vers la rencontre source.
  const parts: string[] = [];
  if (item.description && item.description.trim()) parts.push(item.description.trim());
  if (item.notes && item.notes.trim()) {
    if (parts.length > 0) parts.push("");
    parts.push("Notes prises en rencontre :");
    parts.push(item.notes.trim());
  }
  parts.push("");
  parts.push(`— Généré depuis la rencontre « ${item.meeting.title} »`);
  parts.push(`(point d'ordre du jour : ${item.title})`);
  const description = parts.join("\n");

  const ticket = await prisma.ticket.create({
    data: {
      organizationId: internalOrg.id,
      creatorId: me.id,
      assigneeId,
      subject: item.title,
      description,
      status: "NEW",
      priority,
      type: "SERVICE_REQUEST",
      source: "PORTAL",
      isInternal: true,
      meetingId,
    },
    select: { id: true, number: true, subject: true, priority: true, status: true },
  });

  return NextResponse.json(ticket, { status: 201 });
}
