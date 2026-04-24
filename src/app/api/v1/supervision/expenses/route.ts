// ============================================================================
// GET /api/v1/supervision/expenses?from=&to=
//
// Vue superviseur des dépenses soumises par les agents sur une plage. Agrège
// par agent (submitter) avec total + nombre d'entrées, et expose les N
// dernières entrées pour visualisation rapide. Utilisé dans la page
// Supervision pour détecter les patterns (trop de facturation manuelle,
// entrées sans pièce jointe, etc.).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN" && me.role !== "SUPERVISOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 24 * 3600_000);
  const to = toParam ? new Date(toParam) : new Date();

  // Entries créées dans la plage (date effective de la dépense, pas de
  // submitted/approved — on veut voir tout ce qui a été saisi).
  const entries = await prisma.expenseEntry.findMany({
    where: { date: { gte: from, lte: to } },
    include: {
      report: {
        select: {
          id: true,
          title: true,
          status: true,
          submitterId: true,
          submitter: {
            select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
          },
        },
      },
      organization: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  interface Entry {
    id: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    vendor: string | null;
    isBillable: boolean;
    hasReceipt: boolean;
    organizationName: string | null;
    reportId: string;
    reportTitle: string;
    reportStatus: string;
  }

  interface Bucket {
    agent: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      avatar: string | null;
    };
    total: number;
    billable: number;
    entryCount: number;
    withoutReceiptCount: number;
    entries: Entry[];
  }

  const buckets = new Map<string, Bucket>();
  for (const e of entries) {
    const sub = e.report.submitter;
    const key = sub.id;
    if (!buckets.has(key)) {
      buckets.set(key, {
        agent: {
          id: sub.id,
          firstName: sub.firstName,
          lastName: sub.lastName,
          email: sub.email,
          avatar: sub.avatar,
        },
        total: 0,
        billable: 0,
        entryCount: 0,
        withoutReceiptCount: 0,
        entries: [],
      });
    }
    const b = buckets.get(key)!;
    b.total += e.amount;
    if (e.isBillable) b.billable += e.amount;
    b.entryCount++;
    if (!e.receiptUrl) b.withoutReceiptCount++;
    b.entries.push({
      id: e.id,
      date: e.date.toISOString(),
      category: e.category,
      description: e.description,
      amount: e.amount,
      vendor: e.vendor,
      isBillable: e.isBillable,
      hasReceipt: !!e.receiptUrl,
      organizationName: e.organization?.name ?? null,
      reportId: e.reportId,
      reportTitle: e.report.title,
      reportStatus: e.report.status,
    });
  }

  const agents = Array.from(buckets.values()).sort((a, b) => b.total - a.total);

  return NextResponse.json({
    agents,
    totals: {
      grandTotal: agents.reduce((s, a) => s + a.total, 0),
      entryCount: agents.reduce((s, a) => s + a.entryCount, 0),
      agentsCount: agents.length,
      withoutReceipt: agents.reduce((s, a) => s + a.withoutReceiptCount, 0),
    },
    range: { from: from.toISOString(), to: to.toISOString() },
  });
}
