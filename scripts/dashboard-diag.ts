// Simule la requête de l'endpoint /api/v1/dashboard/stats pour voir
// exactement ce qu'il renvoie après la migration.

import prisma from "../src/lib/prisma";

async function main() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const lastMonth = new Date(now);
  lastMonth.setDate(lastMonth.getDate() - 30);

  const OPEN_STATUSES = [
    "NEW",
    "OPEN",
    "IN_PROGRESS",
    "ON_SITE",
    "WAITING_CLIENT",
    "WAITING_VENDOR",
    "PENDING",
  ] as const;

  const [openTickets, unassigned, overdue, slaBreached, ticketsToday, totalRecent] =
    await Promise.all([
      prisma.ticket.count({ where: { status: { in: OPEN_STATUSES as never } } }),
      prisma.ticket.count({
        where: { status: { in: OPEN_STATUSES as never }, assigneeId: null },
      }),
      prisma.ticket.count({
        where: { isOverdue: true, status: { in: OPEN_STATUSES as never } },
      }),
      prisma.ticket.count({
        where: { slaBreached: true, createdAt: { gte: lastMonth } },
      }),
      prisma.ticket.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.ticket.count({ where: { createdAt: { gte: lastMonth } } }),
    ]);

  console.log("Dashboard stats:", {
    openTickets,
    unassigned,
    overdue,
    slaBreached,
    ticketsToday,
    totalRecent,
  });

  const priorityRows = await prisma.ticket.groupBy({
    by: ["priority"],
    where: { status: { in: OPEN_STATUSES as never } },
    _count: { id: true },
  });
  console.log("Priority rows:", priorityRows);

  const recentRows = await prisma.ticket.findMany({
    where: {
      status: { in: OPEN_STATUSES as never },
      assigneeId: null,
      isInternal: false,
    },
    include: {
      organization: true,
      assignee: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log(`Recent unassigned: ${recentRows.length}`);
  for (const r of recentRows.slice(0, 3)) {
    console.log(`  #${r.number} ${r.subject.slice(0, 50)} [${r.status}] ${r.organization?.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
