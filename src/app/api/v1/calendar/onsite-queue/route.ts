import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getAccessibleOrgIds } from "@/lib/auth/org-access";

/**
 * GET /api/v1/calendar/onsite-queue
 *
 * File de planification "à faire sur place" pour le panneau du calendrier.
 *
 * Croise deux sources :
 *   1. Tickets actifs avec `requiresOnSite=true`
 *   2. Events `WORK_LOCATION` cédulés dans les `windowDays` prochains jours
 *
 * Retourne deux groupes :
 *   - `upcoming` : orgs qui ont une visite à venir → tickets à embarquer
 *     dans cette visite. Trié par date du prochain event (asc).
 *   - `other`    : orgs sans visite cédulée → tickets en attente de
 *     planification. Trié par nombre de tickets desc.
 *
 * Query params :
 *   - `windowDays` (optionnel, défaut 14) : fenêtre de recherche d'events
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const windowDays = Math.max(1, Math.min(60, parseInt(url.searchParams.get("windowDays") ?? "14", 10) || 14));
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 3600 * 1000);

  // Scoping client : si l'utilisateur est restreint à certaines orgs,
  // on filtre. Pour staff, getAccessibleOrgIds renvoie null (= toutes).
  const allowedOrgIds = await getAccessibleOrgIds(me);

  // 1. Tickets actifs marqués requiresOnSite
  const tickets = await prisma.ticket.findMany({
    where: {
      requiresOnSite: true,
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED", "DELETED"] },
      isInternal: false,
      ...(allowedOrgIds ? { organizationId: { in: allowedOrgIds } } : {}),
    },
    select: {
      id: true,
      number: true,
      subject: true,
      priority: true,
      status: true,
      organizationId: true,
      organization: { select: { id: true, name: true } },
      assignee: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  // 2. Events WORK_LOCATION à venir dans la fenêtre — pour mapper org → prochaine visite
  const upcomingEvents = await prisma.calendarEvent.findMany({
    where: {
      kind: "WORK_LOCATION",
      status: "active",
      deletedAt: null,
      startsAt: { gte: now, lte: windowEnd },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      organizationId: true,
      organizationIds: true,
      agents: {
        select: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  // Build map orgId → premier event (le plus proche dans le futur)
  type NextVisit = {
    eventId: string;
    title: string;
    startsAt: Date;
    agents: { id: string; firstName: string; lastName: string }[];
  };
  const orgToNextVisit = new Map<string, NextVisit>();
  for (const ev of upcomingEvents) {
    // Un event peut concerner plusieurs orgs (organizationIds[]) ou une seule (organizationId).
    const orgIds = ev.organizationIds.length > 0
      ? ev.organizationIds
      : ev.organizationId
        ? [ev.organizationId]
        : [];
    for (const oid of orgIds) {
      if (!orgToNextVisit.has(oid)) {
        orgToNextVisit.set(oid, {
          eventId: ev.id,
          title: ev.title,
          startsAt: ev.startsAt,
          agents: ev.agents.map((a) => a.user),
        });
      }
    }
  }

  // 3. Group tickets by org, split upcoming vs other
  type TicketDTO = {
    id: string;
    displayNumber: string;
    subject: string;
    priority: string;
    status: string;
    assignee: { firstName: string; lastName: string } | null;
  };
  type OrgGroup = {
    organizationId: string;
    organizationName: string;
    nextVisit: NextVisit | null;
    tickets: TicketDTO[];
  };

  const groups = new Map<string, OrgGroup>();
  for (const t of tickets) {
    if (!t.organizationId || !t.organization) continue;
    let g = groups.get(t.organizationId);
    if (!g) {
      g = {
        organizationId: t.organizationId,
        organizationName: t.organization.name,
        nextVisit: orgToNextVisit.get(t.organizationId) ?? null,
        tickets: [],
      };
      groups.set(t.organizationId, g);
    }
    g.tickets.push({
      id: t.id,
      displayNumber: `#${t.number}`,
      subject: t.subject,
      priority: t.priority,
      status: t.status,
      assignee: t.assignee,
    });
  }

  // Sort upcoming by visit date asc, other by ticket count desc.
  const upcoming = Array.from(groups.values())
    .filter((g) => g.nextVisit !== null)
    .sort((a, b) => (a.nextVisit!.startsAt.getTime() - b.nextVisit!.startsAt.getTime()));

  const other = Array.from(groups.values())
    .filter((g) => g.nextVisit === null)
    .sort((a, b) => b.tickets.length - a.tickets.length || a.organizationName.localeCompare(b.organizationName, "fr"));

  return NextResponse.json({
    upcoming,
    other,
    totalTickets: tickets.length,
    totalOrgs: groups.size,
  });
}
