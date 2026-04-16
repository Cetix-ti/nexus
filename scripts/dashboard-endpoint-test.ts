// Exécute la logique EXACTE de /api/v1/dashboard/stats sans passer par
// le middleware auth, pour vérifier que tout fonctionne après les
// récentes modifs (prioritySource, LOW default, portalDefaultRole non-null).
// Si ça passe ici, la régression est ailleurs.

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

  const [
    openTickets,
    unassigned,
    overdue,
    slaBreached,
    ticketsToday,
    totalRecent,
    avgResolution,
  ] = await Promise.all([
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
    prisma.$queryRaw<{ avg: number | null }[]>`
        SELECT EXTRACT(EPOCH FROM AVG(resolved_at - created_at)) / 3600 AS avg
        FROM tickets
        WHERE resolved_at IS NOT NULL AND created_at >= ${lastMonth}
      `,
  ]);

  console.log("Stats:", {
    openTickets,
    unassigned,
    overdue,
    slaBreached,
    ticketsToday,
    totalRecent,
    avg: avgResolution[0]?.avg,
  });

  const volumeRows = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
      FROM tickets
      WHERE created_at >= ${sevenDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `;
  console.log("Volume rows:", volumeRows.length);

  const priorityRows = await prisma.ticket.groupBy({
    by: ["priority"],
    where: { status: { in: OPEN_STATUSES as never } },
    _count: { id: true },
  });
  console.log("Priority rows:", priorityRows);

  const internalOrg = await prisma.organization.findFirst({
    where: { slug: "cetix" },
    select: { id: true },
  });
  const orgRows = await prisma.ticket.groupBy({
    by: ["organizationId"],
    where: {
      status: { in: OPEN_STATUSES as never },
      ...(internalOrg ? { organizationId: { not: internalOrg.id } } : {}),
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 8,
  });
  console.log("Org rows:", orgRows.length);
}

main()
  .catch((e) => {
    console.error("FAIL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
