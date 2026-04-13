import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const submitterId = url.searchParams.get("submitterId") || undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (submitterId) where.submitterId = submitterId;

  const reports = await prisma.expenseReport.findMany({
    where,
    include: {
      submitter: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      entries: { select: { id: true, amount: true, category: true, date: true, isBillable: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(reports.map((r) => ({
    id: r.id,
    title: r.title,
    submitterName: `${r.submitter.firstName} ${r.submitter.lastName}`,
    submitterAvatar: r.submitter.avatar,
    submitterId: r.submitterId,
    status: r.status,
    totalAmount: r.totalAmount,
    entryCount: r.entries.length,
    periodStart: r.periodStart?.toISOString() ?? null,
    periodEnd: r.periodEnd?.toISOString() ?? null,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    categories: [...new Set(r.entries.map((e) => e.category))],
    billableAmount: r.entries.filter((e) => e.isBillable).reduce((s, e) => s + e.amount, 0),
  })));
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const report = await prisma.expenseReport.create({
    data: {
      title: body.title || `Rapport de dépenses — ${new Date().toLocaleDateString("fr-CA")}`,
      submitterId: me.id,
      periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
      periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
      notes: body.notes,
      entries: body.entries?.length ? {
        create: body.entries.map((e: any) => ({
          date: new Date(e.date),
          category: e.category,
          description: e.description,
          amount: e.amount,
          vendor: e.vendor,
          isBillable: e.isBillable ?? false,
          organizationId: e.organizationId,
          ticketId: e.ticketId,
        })),
      } : undefined,
    },
  });

  // Update total
  if (body.entries?.length) {
    const total = body.entries.reduce((s: number, e: any) => s + (e.amount || 0), 0);
    await prisma.expenseReport.update({ where: { id: report.id }, data: { totalAmount: total } });
  }

  return NextResponse.json(report, { status: 201 });
}
