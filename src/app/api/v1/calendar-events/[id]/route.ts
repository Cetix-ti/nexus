import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole, type UserRole } from "@/lib/auth-utils";
import { stripHtmlToText } from "@/lib/calendar/description-utils";

/** Strip the "@occurrenceStartISO" suffix that the API adds to recurring
 *  event occurrences — DB operations doivent cibler l'event-source. */
function normalizeEventId(raw: string): string {
  const at = raw.indexOf("@");
  return at >= 0 ? raw.slice(0, at) : raw;
}

/**
 * Un event est modifiable par :
 *  - son owner (pour un congé, un WFH, un perso)
 *  - son créateur
 *  - un SUPERVISOR+ (override admin)
 */
async function assertCanMutate(
  eventId: string,
  me: { id: string; role: UserRole },
): Promise<string | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { ownerId: true, createdById: true },
  });
  if (!event) return "Not found";
  const isOwner = event.ownerId === me.id;
  const isCreator = event.createdById === me.id;
  const isSupervisor = hasMinimumRole(me.role, "SUPERVISOR");
  if (!isOwner && !isCreator && !isSupervisor) return "Forbidden";
  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: rawId } = await params;
  const id = normalizeEventId(rawId);
  const forbidden = await assertCanMutate(id, me);
  if (forbidden === "Not found") return NextResponse.json({ error: forbidden }, { status: 404 });
  if (forbidden) return NextResponse.json({ error: forbidden }, { status: 403 });

  const body = await req.json();

  // Validation dates si fournies
  let startsAtDate: Date | undefined;
  let endsAtDate: Date | undefined;
  if (body.startsAt) {
    startsAtDate = new Date(body.startsAt);
    if (Number.isNaN(startsAtDate.getTime())) {
      return NextResponse.json({ error: "startsAt invalide" }, { status: 400 });
    }
  }
  if (body.endsAt) {
    endsAtDate = new Date(body.endsAt);
    if (Number.isNaN(endsAtDate.getTime())) {
      return NextResponse.json({ error: "endsAt invalide" }, { status: 400 });
    }
  }
  if (startsAtDate && endsAtDate && endsAtDate <= startsAtDate) {
    return NextResponse.json(
      { error: "La fin doit être après le début" },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  const allow = [
    "title", "description", "kind", "allDay", "ownerId", "location",
    "organizationId", "siteId", "renewalType", "renewalAmount", "renewalNotifyDaysBefore",
    "renewalExternalRef", "leaveType", "leaveApproved", "recurrence",
    "internalTicketId", "internalProjectId", "calendarId", "status",
  ];
  for (const k of allow) if (k in body) data[k] = body[k];
  if (typeof data.title === "string") {
    const trimmed = data.title.trim();
    if (!trimmed) return NextResponse.json({ error: "Titre vide" }, { status: 400 });
    data.title = trimmed;
  }
  // Normalise systématiquement la description en plain text — voir
  // src/lib/calendar/description-utils.ts pour la raison d'être (Outlook
  // + clients API qui pourraient envoyer du HTML par inadvertance).
  if ("description" in body) {
    data.description = stripHtmlToText(body.description);
  }
  if (startsAtDate) data.startsAt = startsAtDate;
  if (endsAtDate) data.endsAt = endsAtDate;
  if (body.recurrenceEndDate) data.recurrenceEndDate = new Date(body.recurrenceEndDate);

  const updated = await prisma.calendarEvent.update({
    where: { id },
    data,
  });

  // Multi-agents : si agentIds[] est fourni, on remplace la jointure.
  if (Array.isArray(body.agentIds)) {
    await prisma.calendarEventAgent.deleteMany({ where: { eventId: id } });
    if (body.agentIds.length > 0) {
      await prisma.calendarEventAgent.createMany({
        data: body.agentIds.map((userId: string) => ({ eventId: id, userId })),
        skipDuplicates: true,
      });
    }
  }

  // Multi-tickets : si linkedTicketIds[] est fourni, on synchronise
  // Ticket.calendarEventId. Les tickets anciennement liés et non
  // re-sélectionnés sont déliés (calendarEventId = null). Les nouveaux
  // sont liés. Idempotent.
  if (Array.isArray(body.linkedTicketIds)) {
    const ids = body.linkedTicketIds.filter(
      (t: unknown) => typeof t === "string" && !!t,
    ) as string[];
    // Déliaison : tickets actuels qui ne sont plus dans la nouvelle liste.
    await prisma.ticket.updateMany({
      where: { calendarEventId: id, id: { notIn: ids } },
      data: { calendarEventId: null },
    });
    // Liaison : tickets nouveaux (ou confirmés).
    if (ids.length > 0) {
      await prisma.ticket.updateMany({
        where: { id: { in: ids } },
        data: { calendarEventId: id },
      });
    }
  }

  // Push synchro Outlook (WORK_LOCATION uniquement).
  if (updated.kind === "WORK_LOCATION") {
    import("@/lib/calendar/location-sync")
      .then(({ pushEventToOutlook }) => pushEventToOutlook(id))
      .catch((e) => console.warn("[location-sync] push failed:", e));
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: rawId } = await params;
  const id = normalizeEventId(rawId);
  const forbidden = await assertCanMutate(id, me);
  if (forbidden === "Not found") return NextResponse.json({ error: forbidden }, { status: 404 });
  if (forbidden) return NextResponse.json({ error: forbidden }, { status: 403 });

  // Supprime côté Outlook d'abord (best-effort), puis en DB.
  const linked = await prisma.calendarEvent.findUnique({
    where: { id },
    select: { outlookEventId: true, kind: true },
  });
  if (linked?.kind === "WORK_LOCATION" && linked.outlookEventId) {
    try {
      const { deleteEventFromOutlook } = await import("@/lib/calendar/location-sync");
      await deleteEventFromOutlook(id);
    } catch (e) {
      console.warn("[location-sync] delete Outlook failed:", e);
    }
  }

  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
