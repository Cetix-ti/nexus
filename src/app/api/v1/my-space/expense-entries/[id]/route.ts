// ============================================================================
// DELETE /api/v1/my-space/expense-entries/[id]
// Supprime une entrée de dépense appartenant à l'agent courant. Recalcule
// le total du rapport parent. Un agent ne peut supprimer que ses propres
// entrées.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const entry = await prisma.expenseEntry.findFirst({
    where: { id, report: { submitterId: me.id } },
    select: { id: true, reportId: true, report: { select: { status: true } } },
  });
  if (!entry) return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
  // Sécurité : on refuse la suppression si le rapport a été soumis /
  // approuvé — l'agent doit demander une réouverture à l'admin.
  if (entry.report.status !== "DRAFT") {
    return NextResponse.json({
      error: "Le rapport a déjà été soumis — impossible de supprimer cette entrée.",
    }, { status: 409 });
  }

  await prisma.expenseEntry.delete({ where: { id } });

  const totals = await prisma.expenseEntry.aggregate({
    where: { reportId: entry.reportId },
    _sum: { amount: true },
  });
  await prisma.expenseReport.update({
    where: { id: entry.reportId },
    data: { totalAmount: totals._sum.amount ?? 0 },
  });

  return NextResponse.json({ ok: true });
}
