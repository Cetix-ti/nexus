// ============================================================================
// GET /api/v1/tickets/awaiting-reply
//
// Retourne les tickets ouverts dont la DERNIÈRE communication vient d'un
// contact (source portal ou email) ET dont l'agent n'a pas encore
// "acknowledgé" cette réponse (last comment client.createdAt >
// ticket.lastClientReplyAcknowledgedAt OU jamais).
//
// Filtres :
//   - statut OUVERT (NEW, OPEN, IN_PROGRESS, ON_SITE, PENDING,
//     WAITING_VENDOR, SCHEDULED). Les tickets RESOLVED/CLOSED/CANCELLED
//     sont exclus — la conversation s'y arrête.
//   - tickets non internes (les tickets internes n'ont pas de "client" qui
//     répond)
//
// Auth : agents staff seulement (pas CLIENT_*).
// ============================================================================

import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";

export const dynamic = "force-dynamic";

const OPEN_STATUSES: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.ON_SITE,
  TicketStatus.PENDING,
  TicketStatus.WAITING_CLIENT,
  TicketStatus.WAITING_VENDOR,
  TicketStatus.SCHEDULED,
];

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Étape 1 : récupère tous les tickets ouverts non internes (limite
  // raisonnable pour ne pas saturer). On filtre côté JS sur la condition
  // "dernier commentaire = client + non ack" — Prisma ne permet pas
  // facilement ce join correlé en une seule query.
  const tickets = await prisma.ticket.findMany({
    where: {
      isInternal: false,
      status: { in: OPEN_STATUSES },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      priority: true,
      lastClientReplyAcknowledgedAt: true,
      organization: { select: { name: true, slug: true } },
      requester: { select: { firstName: true, lastName: true } },
      // Le dernier commentaire — sert à savoir s'il vient du client et
      // s'il est postérieur au lastClientReplyAcknowledgedAt.
      comments: {
        select: {
          id: true,
          source: true,
          createdAt: true,
          isInternal: true,
          author: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const prefix = await getClientTicketPrefix();
  const awaiting = tickets
    .map((t) => {
      const lastComment = t.comments[0];
      if (!lastComment) return null;
      // Notes internes ne comptent pas (origine agent côté MSP)
      if (lastComment.isInternal) return null;
      // On considère "réponse client" si source explicite portal/email
      // OU si l'auteur n'est pas un User (= contact externe — rare car
      // tous les comments ont un authorId User dans le schéma actuel,
      // mais robuste à un éventuel élargissement futur).
      const isClient = lastComment.source === "portal" || lastComment.source === "email";
      if (!isClient) return null;
      const ackAt = t.lastClientReplyAcknowledgedAt;
      if (ackAt && ackAt >= lastComment.createdAt) return null;
      return {
        id: t.id,
        number: t.number,
        displayNumber: formatTicketNumber(t.number, false, prefix),
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        organizationName: t.organization?.name ?? "—",
        organizationSlug: t.organization?.slug ?? null,
        requesterName: t.requester
          ? `${t.requester.firstName} ${t.requester.lastName}`.trim()
          : null,
        lastReplyAt: lastComment.createdAt.toISOString(),
        lastReplySource: lastComment.source,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.lastReplyAt.localeCompare(a.lastReplyAt));

  return NextResponse.json({
    tickets: awaiting,
    count: awaiting.length,
  });
}
