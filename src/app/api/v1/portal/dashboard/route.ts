import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";

export async function GET() {
  try {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = user.organizationId;
  const canSeeAll = user.permissions.canSeeAllOrgTickets;
  const contactId = user.contactId;

  // Ticket stats
  const ticketWhere: any = { organizationId: orgId };
  if (!canSeeAll) ticketWhere.requesterId = contactId;

  const [totalTickets, openTickets, resolvedTickets, recentTickets, assetCount] =
    await Promise.all([
      prisma.ticket.count({ where: ticketWhere }),
      prisma.ticket.count({
        where: { ...ticketWhere, status: { in: ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE"] } },
      }),
      prisma.ticket.count({
        where: { ...ticketWhere, status: { in: ["RESOLVED", "CLOSED"] } },
      }),
      prisma.ticket.findMany({
        where: ticketWhere,
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      prisma.asset.count({
        where: user.permissions.canSeeAllOrgAssets
          ? { organizationId: orgId }
          : { assignedContactId: contactId },
      }),
    ]);

  // Get org logo
  const orgData = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { logo: true },
  });

  // Portail client : l'org courante n'est jamais interne (filtre business).
  // On force isInternal=false côté format → préfixe client configurable
  // via /settings (par défaut "TK-").
  const clientPrefix = await getClientTicketPrefix();

  return NextResponse.json({
    stats: {
      totalTickets,
      openTickets,
      resolvedTickets,
      assetCount,
    },
    orgLogo: orgData?.logo ?? null,
    recentTickets: recentTickets.map((t) => ({
      id: t.id,
      number: formatTicketNumber(t.number, false, clientPrefix),
      subject: t.subject,
      status: t.status.toLowerCase(),
      priority: t.priority.toLowerCase(),
      updatedAt: t.updatedAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    })),
    userName: user.name,
    organizationName: user.organizationName,
    portalRole: user.portalRole,
  });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
