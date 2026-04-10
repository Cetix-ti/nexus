import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function extractCount(row: any): number {
  if (typeof row._count === "number") return row._count;
  if (row._count && typeof row._count._all === "number") return row._count._all;
  return 0;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days")) || 7;
  const status = searchParams.get("status");
  const orgId = searchParams.get("organizationId");

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: any = { receivedAt: { gte: since } };
  if (status) where.status = status;
  if (orgId) where.organizationId = orgId;

  const [alerts, rawStats, rawOrgStats] = await Promise.all([
    prisma.veeamBackupAlert.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 500,
    }),

    prisma.veeamBackupAlert.groupBy({
      by: ["status"],
      where: { receivedAt: { gte: since } },
      _count: true,
    }),

    prisma.veeamBackupAlert.groupBy({
      by: ["organizationId", "organizationName", "status"],
      where: { receivedAt: { gte: since } },
      _count: true,
    }),
  ]);

  const stats = rawStats.map((r) => ({
    status: r.status,
    _count: extractCount(r),
  }));

  const orgStats = rawOrgStats.map((r) => ({
    organizationId: r.organizationId,
    organizationName: r.organizationName,
    status: r.status,
    _count: extractCount(r),
  }));

  return NextResponse.json({
    alerts,
    stats,
    orgStats,
    since: since.toISOString(),
  });
}
