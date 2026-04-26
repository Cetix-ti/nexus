// ============================================================================
// /api/v1/my-space/expense-entries
//
// GET  : retourne la liste PLATE de toutes les entrées de dépense soumises
//        par l'agent courant, à travers tous ses rapports. Triées par date
//        décroissante.
// POST : ajoute UNE entrée. Si l'utilisateur a déjà un rapport DRAFT pour
//        le mois courant, l'entrée s'y attache. Sinon un nouveau rapport
//        DRAFT est créé automatiquement (cas d'usage : saisir une dépense
//        depuis un ticket sans avoir d'abord à créer un rapport).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

const createSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  vendor: z.string().max(200).optional().nullable(),
  receiptUrl: z.string().max(2000).optional().nullable(),
  isBillable: z.boolean().optional(),
  organizationId: z.string().optional().nullable(),
  ticketId: z.string().optional().nullable(),
});

function monthBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const d = parsed.data;
  // Date robuste : accepte "YYYY-MM-DD" (heure 00:00 locale) ou ISO datetime.
  const entryDate =
    /^\d{4}-\d{2}-\d{2}$/.test(d.date)
      ? new Date(`${d.date}T08:00:00`)
      : new Date(d.date);

  // Trouve le rapport DRAFT du mois courant, ou crée-en un. Permet à
  // l'agent de saisir une dépense depuis un ticket sans avoir à créer
  // manuellement un rapport au préalable.
  const { start, end } = monthBounds(entryDate);
  let report = await prisma.expenseReport.findFirst({
    where: {
      submitterId: me.id,
      status: "DRAFT",
      periodStart: { lte: end },
      OR: [{ periodEnd: { gte: start } }, { periodEnd: null }],
    },
    select: { id: true },
  });
  if (!report) {
    const monthLabel = entryDate.toLocaleDateString("fr-CA", {
      month: "long",
      year: "numeric",
    });
    report = await prisma.expenseReport.create({
      data: {
        title: `Dépenses — ${monthLabel}`,
        submitterId: me.id,
        periodStart: start,
        periodEnd: end,
      },
      select: { id: true },
    });
  }

  const created = await prisma.expenseEntry.create({
    data: {
      reportId: report.id,
      date: entryDate,
      category: d.category,
      description: d.description,
      amount: d.amount,
      currency: d.currency ?? "CAD",
      vendor: d.vendor ?? null,
      receiptUrl: d.receiptUrl ?? null,
      isBillable: d.isBillable ?? false,
      organizationId: d.organizationId ?? null,
      ticketId: d.ticketId ?? null,
    },
  });

  // Recalcul du total agrégé du rapport.
  const sum = await prisma.expenseEntry.aggregate({
    where: { reportId: report.id },
    _sum: { amount: true },
  });
  await prisma.expenseReport.update({
    where: { id: report.id },
    data: { totalAmount: sum._sum.amount ?? 0 },
  });

  return NextResponse.json(
    {
      id: created.id,
      reportId: report.id,
      date: created.date.toISOString(),
      amount: created.amount,
      ticketId: created.ticketId,
    },
    { status: 201 },
  );
}
