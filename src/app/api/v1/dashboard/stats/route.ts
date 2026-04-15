import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const myUserId = me.id;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const lastMonth = new Date(now);
    lastMonth.setDate(lastMonth.getDate() - 30);

    const OPEN_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "WAITING_CLIENT", "WAITING_VENDOR", "PENDING"] as const;

    const [
      openTickets,
      unassigned,
      overdue,
      slaBreached,
      ticketsToday,
      totalRecent,
      avgResolution,
    ] = await Promise.all([
      prisma.ticket.count({ where: { status: { in: OPEN_STATUSES as any } } }),
      prisma.ticket.count({ where: { status: { in: OPEN_STATUSES as any }, assigneeId: null } }),
      prisma.ticket.count({ where: { isOverdue: true, status: { in: OPEN_STATUSES as any } } }),
      prisma.ticket.count({ where: { slaBreached: true, createdAt: { gte: lastMonth } } }),
      prisma.ticket.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.ticket.count({ where: { createdAt: { gte: lastMonth } } }),
      prisma.$queryRaw<{ avg: number | null }[]>`
        SELECT EXTRACT(EPOCH FROM AVG(resolved_at - created_at)) / 3600 AS avg
        FROM tickets
        WHERE resolved_at IS NOT NULL AND created_at >= ${lastMonth}
      `,
    ]);

    const slaCompliance =
      totalRecent === 0 ? 100 : Math.round(((totalRecent - slaBreached) / totalRecent) * 100);
    const avgResolutionHours = avgResolution[0]?.avg ? Math.round(Number(avgResolution[0].avg)) : 0;

    // Volume per day (last 7 days)
    const volumeRows = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
      FROM tickets
      WHERE created_at >= ${sevenDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `;
    const volume: { date: string; tickets: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const row = volumeRows.find((r) => new Date(r.day).toISOString().slice(0, 10) === key);
      volume.push({
        date: d.toLocaleDateString("fr-CA", { weekday: "short" }),
        tickets: row ? Number(row.count) : 0,
      });
    }

    // Priority breakdown of currently open tickets
    const priorityRows = await prisma.ticket.groupBy({
      by: ["priority"],
      where: { status: { in: OPEN_STATUSES as any } },
      _count: { id: true },
    });
    const PRIORITY_LABEL_COLOR: Record<string, { name: string; color: string }> = {
      CRITICAL: { name: "Critique", color: "#EF4444" },
      HIGH: { name: "Élevée", color: "#F97316" },
      MEDIUM: { name: "Moyenne", color: "#EAB308" },
      LOW: { name: "Faible", color: "#22C55E" },
    };
    const ticketsByPriority = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => ({
      ...PRIORITY_LABEL_COLOR[p],
      value: priorityRows.find((r) => r.priority === p)?._count.id ?? 0,
    }));

    // Top orgs by open ticket count (exclude internal/MSP org)
    const internalOrg = await prisma.organization.findFirst({
      where: { slug: "cetix" },
      select: { id: true },
    });
    const orgRows = await prisma.ticket.groupBy({
      by: ["organizationId"],
      where: {
        status: { in: OPEN_STATUSES as any },
        ...(internalOrg ? { organizationId: { not: internalOrg.id } } : {}),
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    });
    const orgs = await prisma.organization.findMany({
      where: { id: { in: orgRows.map((r) => r.organizationId) } },
      select: { id: true, name: true },
    });
    const ticketsByOrg = orgRows.map((r) => ({
      name: orgs.find((o) => o.id === r.organizationId)?.name || "—",
      tickets: r._count.id,
    }));

    // Tickets récents NON ASSIGNÉS (pour le widget « Tickets récents non
    // assignés » du dashboard). Filtre serveur-side sur assigneeId null
    // pour ne pas dépendre d'un take=8 puis d'un filtre client-side qui
    // pourrait n'afficher rien si les 8 derniers sont tous assignés.
    // Exclut les tickets internes (admin Cetix) pour cohérence avec la
    // séparation client/interne.
    const recentRows = await prisma.ticket.findMany({
      where: {
        status: { in: OPEN_STATUSES as any },
        assigneeId: null,
        isInternal: false,
      },
      include: {
        organization: true,
        assignee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    const recentTickets = recentRows.map((t) => ({
      id: t.id,
      number: t.number,
      subject: t.subject,
      organization: t.organization?.name || "—",
      status: t.status.toLowerCase(),
      priority: t.priority.toLowerCase(),
      assigneeName: t.assignee
        ? `${t.assignee.firstName} ${t.assignee.lastName}`
        : null,
      isInternal: t.isInternal,
      createdAt: t.createdAt.toISOString(),
    }));

    // My tickets (assigned to current user) — pleine largeur dans le
    // dashboard, donc on en affiche un peu plus (12 au lieu de 8).
    let myTickets: any[] = [];
    if (myUserId) {
      const myRows = await prisma.ticket.findMany({
        where: { assigneeId: myUserId, status: { in: OPEN_STATUSES as any } },
        include: { organization: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      myTickets = myRows.map((t) => ({
        id: t.id,
        number: t.number,
        subject: t.subject,
        organization: t.organization?.name || "—",
        status: t.status.toLowerCase(),
        priority: t.priority.toLowerCase(),
        isInternal: t.isInternal,
        createdAt: t.createdAt.toISOString(),
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          openTickets,
          unassigned,
          overdue,
          slaCompliance,
          avgResolutionTime: avgResolutionHours,
          ticketsToday,
        },
        ticketVolume: volume,
        ticketsByPriority,
        ticketsByOrg,
        recentTickets,
        myTickets,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
