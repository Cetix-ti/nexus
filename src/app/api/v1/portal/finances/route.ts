import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET() {
  try {
    const user = await getCurrentPortalUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = user.organizationId;

    const [timeEntries, contracts] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { organizationId: orgId },
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          durationMinutes: true,
          coverageStatus: true,
          amount: true,
          startedAt: true,
          description: true,
          isOnsite: true,
          approvalStatus: true,
        },
      }),
      prisma.contract.findMany({
        where: { organizationId: orgId, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          type: true,
          monthlyHours: true, hourlyRate: true,
          startDate: true,
          endDate: true,
        },
      }),
    ]);

    const totalBilled = timeEntries
      .filter((e) => e.amount != null && e.amount > 0)
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    const totalHours = Math.round(
      timeEntries.reduce((s, e) => s + e.durationMinutes, 0) / 60 * 10,
    ) / 10;

    const pendingAmount = timeEntries
      .filter((e) => e.approvalStatus !== "invoiced" && e.amount != null && e.amount > 0)
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    const invoicedAmount = timeEntries
      .filter((e) => e.approvalStatus === "invoiced")
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    return NextResponse.json({
      summary: {
        totalBilled: Math.round(totalBilled * 100) / 100,
        totalHours,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        invoicedAmount: Math.round(invoicedAmount * 100) / 100,
      },
      recentEntries: timeEntries.slice(0, 20).map((e) => ({
        id: e.id,
        date: e.startedAt.toISOString(),
        duration: e.durationMinutes,
        description: e.description,
        amount: e.amount,
        coverageStatus: e.coverageStatus,
        isOnsite: e.isOnsite,
        approvalStatus: e.approvalStatus,
      })),
      contracts: contracts.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        monthlyValue: (c.monthlyHours ?? 0) * (c.hourlyRate ?? 0) || null,
        startDate: c.startDate?.toISOString() ?? null,
        endDate: c.endDate?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
