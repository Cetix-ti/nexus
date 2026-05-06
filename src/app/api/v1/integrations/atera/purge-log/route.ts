import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

/**
 * GET /api/v1/integrations/atera/purge-log
 *
 * Query params:
 *   ?batchId=...       Récupère les lignes d'un batch spécifique
 *   ?limit=100         Default 100, max 500
 *   ?cursor=<logId>    Pagination cursor
 *
 * Sans batchId : retourne la liste des batches (groupés) avec leurs métriques.
 * Avec batchId : retourne le détail ligne-par-ligne du batch.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const batchId = sp.get("batchId");
  const limit = Math.max(1, Math.min(500, Number(sp.get("limit") ?? "100")));

  if (batchId) {
    // Détail d'un batch
    const rows = await prisma.ateraPurgeLog.findMany({
      where: { batchId },
      orderBy: { purgedAt: "asc" },
      include: {
        purgedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    return NextResponse.json({ success: true, data: rows });
  }

  // Liste des batches (groupés). On exploite groupBy de Prisma.
  const groups = await prisma.ateraPurgeLog.groupBy({
    by: ["batchId", "purgedById"],
    _count: { _all: true },
    _min: { purgedAt: true },
    _max: { purgedAt: true },
    orderBy: { _max: { purgedAt: "desc" } },
    take: limit,
  });

  // Enrichir avec les compteurs par status par batch (1 query)
  const batchIds = groups.map((g) => g.batchId);
  const statusBreakdown = await prisma.ateraPurgeLog.groupBy({
    by: ["batchId", "status"],
    where: { batchId: { in: batchIds } },
    _count: { _all: true },
  });

  const userIds = [...new Set(groups.map((g) => g.purgedById))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const data = groups.map((g) => ({
    batchId: g.batchId,
    purgedBy: userMap.get(g.purgedById) ?? null,
    startedAt: g._min.purgedAt,
    endedAt: g._max.purgedAt,
    totalCount: g._count._all,
    byStatus: statusBreakdown
      .filter((s) => s.batchId === g.batchId)
      .reduce<Record<string, number>>((acc, s) => {
        acc[s.status] = s._count._all;
        return acc;
      }, {}),
  }));

  return NextResponse.json({ success: true, data });
}
