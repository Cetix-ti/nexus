import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days")) || 7;
  const stage = searchParams.get("stage");
  const sourceType = searchParams.get("sourceType");
  const orgId = searchParams.get("organizationId");
  const resolved = searchParams.get("resolved");

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: any = { receivedAt: { gte: since } };
  if (stage) where.stage = stage;
  if (sourceType) where.sourceType = sourceType;
  if (orgId) where.organizationId = orgId;
  if (resolved === "true") where.isResolved = true;
  if (resolved === "false") where.isResolved = false;

  const [alerts, stageStats, sourceStats] = await Promise.all([
    prisma.monitoringAlert.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 500,
    }),
    prisma.monitoringAlert.groupBy({
      by: ["stage"],
      where: { receivedAt: { gte: since } },
      _count: true,
    }),
    prisma.monitoringAlert.groupBy({
      by: ["sourceType"],
      where: { receivedAt: { gte: since } },
      _count: true,
    }),
  ]);

  return NextResponse.json({
    alerts,
    stageStats: stageStats.map((r) => ({
      stage: r.stage,
      count: typeof r._count === "number" ? r._count : (r._count as any)?._all ?? 0,
    })),
    sourceStats: sourceStats.map((r) => ({
      sourceType: r.sourceType,
      count: typeof r._count === "number" ? r._count : (r._count as any)?._all ?? 0,
    })),
  });
}
