import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const report = await prisma.expenseReport.findUnique({
    where: { id },
    include: {
      submitter: { select: { id: true, firstName: true, lastName: true, email: true } },
      entries: {
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { date: "desc" },
      },
    },
  });
  if (!report) return NextResponse.json({ error: "Rapport introuvable" }, { status: 404 });

  return NextResponse.json({
    id: report.id,
    title: report.title,
    status: report.status,
    totalAmount: report.totalAmount,
    notes: report.notes,
    submitter: { name: `${report.submitter.firstName} ${report.submitter.lastName}`, email: report.submitter.email },
    periodStart: report.periodStart?.toISOString() ?? null,
    periodEnd: report.periodEnd?.toISOString() ?? null,
    submittedAt: report.submittedAt?.toISOString() ?? null,
    approvedAt: report.approvedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    entries: report.entries.map((e) => ({
      id: e.id,
      date: e.date.toISOString(),
      category: e.category,
      description: e.description,
      amount: e.amount,
      currency: e.currency,
      vendor: e.vendor,
      isBillable: e.isBillable,
      organizationName: e.organization?.name ?? null,
    })),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.status) {
    if (body.status === "SUBMITTED") { data.status = "SUBMITTED"; data.submittedAt = new Date(); }
    else if (body.status === "APPROVED") { data.status = "APPROVED"; data.approvedById = me.id; data.approvedAt = new Date(); }
    else if (body.status === "REJECTED") { data.status = "DRAFT"; }
    else if (body.status === "REIMBURSED") { data.status = "REIMBURSED"; }
    else { data.status = body.status; }
  }
  if (body.title) data.title = body.title;
  if (body.notes !== undefined) data.notes = body.notes;

  const updated = await prisma.expenseReport.update({ where: { id }, data });
  return NextResponse.json(updated);
}
