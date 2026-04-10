import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days")) || 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [
    totalTickets,
    createdInPeriod,
    resolvedInPeriod,
    openTickets,
    slaBreached,
    ticketsByStatus,
    ticketsByPriority,
    ticketsByOrg,
    techPerformance,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.count({ where: { createdAt: { gte: since } } }),
    prisma.ticket.count({ where: { resolvedAt: { gte: since } } }),
    prisma.ticket.count({
      where: { status: { in: ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "WAITING_CLIENT"] } },
    }),
    prisma.ticket.count({ where: { slaBreached: true, createdAt: { gte: since } } }),

    prisma.ticket.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: true,
    }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: { createdAt: { gte: since } },
      _count: true,
    }),
    // Top 10 orgs by ticket count
    prisma.ticket.groupBy({
      by: ["organizationId"],
      where: { createdAt: { gte: since } },
      _count: true,
      orderBy: { _count: { organizationId: "desc" } },
      take: 10,
    }),
    // Tech performance: tickets resolved per assignee
    prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: { resolvedAt: { gte: since }, assigneeId: { not: null } },
      _count: true,
      orderBy: { _count: { assigneeId: "desc" } },
      take: 10,
    }),
  ]);

  // Resolve org names
  const orgIds = ticketsByOrg.map((r) => r.organizationId).filter(Boolean) as string[];
  const orgs = orgIds.length
    ? await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      })
    : [];
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  // Resolve assignee names
  const assigneeIds = techPerformance.map((r) => r.assigneeId).filter(Boolean) as string[];
  const users = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, firstName: true, lastName: true, avatar: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const slaCompliance = createdInPeriod > 0
    ? Math.round(((createdInPeriod - slaBreached) / createdInPeriod) * 1000) / 10
    : 100;

  const extractCount = (r: any) =>
    typeof r._count === "number" ? r._count : (r._count as any)?._all ?? 0;

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    kpis: {
      totalTickets,
      createdInPeriod,
      resolvedInPeriod,
      openTickets,
      slaBreached,
      slaCompliance,
    },
    byStatus: ticketsByStatus.map((r) => ({
      status: r.status,
      count: extractCount(r),
    })),
    byPriority: ticketsByPriority.map((r) => ({
      priority: r.priority,
      count: extractCount(r),
    })),
    byOrg: ticketsByOrg.map((r) => ({
      organizationId: r.organizationId,
      organizationName: orgMap.get(r.organizationId) ?? "Inconnu",
      count: extractCount(r),
    })),
    techPerformance: techPerformance.map((r) => {
      const u = userMap.get(r.assigneeId!);
      return {
        userId: r.assigneeId,
        name: u ? `${u.firstName} ${u.lastName}` : "Inconnu",
        avatar: u?.avatar ?? null,
        resolved: extractCount(r),
      };
    }),
  });
}
