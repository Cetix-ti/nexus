// Portail client — budget IT (année fiscale courante par défaut).
//
// Expose :
//  - budget courant (APPROVED ou EXECUTING) de l'année fiscale en cours
//  - lignes visibles au rôle portail (INTERNAL jamais exposé)
//  - synthèse agrégée (total par catégorie, prévu vs réel, upcoming 90j)
//  - versions antérieures (lecture seule) pour traçabilité
//
// Les lignes visibility=INTERNAL ne sont JAMAIS exposées même si le budget
// est CLIENT_ADMIN — l'agent peut cacher une ligne sensible.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { portalVisibilityWhere } from "@/lib/portal/visibility";
import { getCurrentFiscalYear } from "@/lib/budgets/fiscal-year";

export async function GET(req: Request) {
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!portalUser.permissions.canSeeBudget) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const orgId = portalUser.organizationId;
  const fyParam = searchParams.get("fiscalYear");
  const fiscalYear = fyParam ? parseInt(fyParam, 10) : await getCurrentFiscalYear(orgId);

  // Budget visible si APPROVED/EXECUTING/CLOSED (jamais DRAFT/PROPOSED pour le portail).
  const budget = await prisma.budget.findUnique({
    where: { organizationId_fiscalYear: { organizationId: orgId, fiscalYear } },
    include: {
      lines: {
        where: portalVisibilityWhere(portalUser.portalRole),
        orderBy: [{ category: "asc" }, { dueDate: "asc" }],
      },
      versions: {
        where: { statusAtSnapshot: { in: ["APPROVED", "CLOSED"] } },
        orderBy: { version: "desc" },
        take: 5,
        select: { id: true, version: true, statusAtSnapshot: true, createdAt: true, note: true },
      },
    },
  });

  if (!budget || !["APPROVED", "EXECUTING", "CLOSED"].includes(budget.status)) {
    return NextResponse.json({
      fiscalYear,
      status: "UNAVAILABLE",
      message: "Aucun budget approuvé pour cette année fiscale.",
    });
  }

  // Masquer internalNotes + targetAmount non pertinents pour client.
  const {
    internalNotes: _internalNotes, createdByUserId: _cb, updatedByUserId: _ub,
    ...publicBudget
  } = budget;

  // Synthèse : total par catégorie + prévu vs réel.
  const byCategory: Record<string, { planned: number; committed: number; actual: number; count: number }> = {};
  let totalPlanned = 0; let totalCommitted = 0; let totalActual = 0;
  for (const l of budget.lines) {
    const k = l.category;
    if (!byCategory[k]) byCategory[k] = { planned: 0, committed: 0, actual: 0, count: 0 };
    const p = Number(l.plannedAmount || 0);
    const c = Number(l.committedAmount || 0);
    const a = Number(l.actualAmount || 0);
    byCategory[k].planned += p;
    byCategory[k].committed += c;
    byCategory[k].actual += a;
    byCategory[k].count += 1;
    totalPlanned += p; totalCommitted += c; totalActual += a;
  }

  // Prochains renouvellements 90j avec montant éventuel masqué si !canSeeLicenseCounts.
  const horizon = new Date(Date.now() + 90 * 86400_000);
  const upcoming = budget.lines
    .filter((l) => l.dueDate && l.dueDate <= horizon && l.dueDate >= new Date())
    .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))
    .slice(0, 15)
    .map((l) => ({
      id: l.id,
      label: l.label,
      category: l.category,
      dueDate: l.dueDate!.toISOString(),
      amount: portalUser.permissions.canSeeLicenseCounts ? Number(l.plannedAmount || 0) : null,
      currency: l.currency,
    }));

  return NextResponse.json({
    budget: publicBudget,
    summary: {
      totalPlanned,
      totalCommitted,
      totalActual,
      byCategory,
      amountsVisible: portalUser.permissions.canSeeLicenseCounts,
    },
    upcoming,
  });
}
