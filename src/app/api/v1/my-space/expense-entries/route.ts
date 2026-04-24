// ============================================================================
// GET /api/v1/my-space/expense-entries
//
// Retourne la liste PLATE de toutes les entrées de dépense soumises par
// l'agent courant, à travers tous ses rapports. Triées par date
// décroissante. Inclut le statut et le titre du rapport parent pour
// que l'UI puisse afficher le contexte (rapport, période, statut).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Filtre mois optionnel (YYYY-MM). Par défaut : toutes les entrées.
  const monthParam = req.nextUrl.searchParams.get("month");
  let dateFilter: { gte: Date; lte: Date } | undefined;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    dateFilter = {
      gte: new Date(y, m - 1, 1),
      lte: new Date(y, m, 0, 23, 59, 59, 999),
    };
  }

  const entries = await prisma.expenseEntry.findMany({
    where: {
      report: { submitterId: me.id },
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    include: {
      report: { select: { id: true, title: true, status: true, periodStart: true, periodEnd: true } },
      organization: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date.toISOString(),
      category: e.category,
      description: e.description,
      amount: e.amount,
      currency: e.currency,
      vendor: e.vendor,
      receiptUrl: e.receiptUrl,
      isBillable: e.isBillable,
      organizationId: e.organizationId,
      organizationName: e.organization?.name ?? null,
      ticketId: e.ticketId,
      createdAt: e.createdAt.toISOString(),
      report: {
        id: e.report.id,
        title: e.report.title,
        status: e.report.status,
        periodStart: e.report.periodStart?.toISOString() ?? null,
        periodEnd: e.report.periodEnd?.toISOString() ?? null,
      },
    })),
  });
}
