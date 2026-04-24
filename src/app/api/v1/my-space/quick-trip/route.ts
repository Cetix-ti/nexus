// ============================================================================
// POST /api/v1/my-space/quick-trip
//
// Crée en un clic une entrée de dépense "Kilométrage" pour un déplacement
// chez un client QUI N'EST PAS FACTURÉ pour ses déplacements
// (OrgMileageRate.billToClient = false). Le client n'est pas facturé mais
// l'agent est remboursé — c'est une dépense interne Cetix.
//
// L'entrée est créée dans le rapport de dépenses DRAFT du mois courant
// de l'agent (créé automatiquement s'il n'existe pas). Pas de ticket lié.
//
// Pour les clients facturables (billToClient=true), passer plutôt par
// POST /api/v1/time-entries avec isOnsite=true et un ticketId — le
// kilométrage est alors dérivé par GET /api/v1/my-space/mileage.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getGlobalAgentRatePerKm } from "@/lib/billing/global-mileage";

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Agent sans allocation km (véhicule d'entreprise, ou paie en temps) :
  // aucun remboursement perso, on refuse la création de dépense km.
  const meFull = await prisma.user.findUnique({
    where: { id: me.id },
    select: { mileageAllocationEnabled: true },
  });
  if (meFull?.mileageAllocationEnabled === false) {
    return NextResponse.json({
      error: "Aucune allocation kilométrique configurée pour ton compte. Contacte l'administrateur si c'est une erreur.",
    }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const organizationId = body?.organizationId as string | undefined;
  const dateStr = body?.date as string | undefined; // YYYY-MM-DD
  if (!organizationId || !dateStr) {
    return NextResponse.json({ error: "organizationId and date required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "invalid date format — expected YYYY-MM-DD" }, { status: 400 });
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const tripDate = new Date(y, m - 1, d, 12, 0, 0, 0);

  // Vérifie : le client existe et a un OrgMileageRate non-facturable.
  // Si le client est facturable (billToClient=true) ou n'a pas de taux
  // du tout, on refuse et l'UI doit ouvrir le modal avec ticket.
  const [org, rate, globalRate] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    }),
    prisma.orgMileageRate.findUnique({
      where: { organizationId },
      select: { kmRoundTrip: true, billToClient: true },
    }),
    getGlobalAgentRatePerKm(),
  ]);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!rate) {
    return NextResponse.json({
      error: "Barème kilométrage non configuré pour ce client. Configure-le dans Paramètres → Allocations & kilométrage.",
    }, { status: 400 });
  }
  if (rate.billToClient !== false) {
    return NextResponse.json({
      error: "Client facturable — utilise le modal avec sélection de ticket.",
    }, { status: 409 });
  }

  const amount = Number((rate.kmRoundTrip * globalRate).toFixed(2));

  // Rapport DRAFT du mois courant pour cet agent. Période = mois du trip.
  const monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);
  const monthLabel = tripDate.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });

  let report = await prisma.expenseReport.findFirst({
    where: {
      submitterId: me.id,
      status: "DRAFT",
      periodStart: monthStart,
      periodEnd: monthEnd,
    },
    select: { id: true },
  });
  if (!report) {
    report = await prisma.expenseReport.create({
      data: {
        title: `Dépenses ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`,
        submitterId: me.id,
        status: "DRAFT",
        periodStart: monthStart,
        periodEnd: monthEnd,
      },
      select: { id: true },
    });
  }

  const entry = await prisma.expenseEntry.create({
    data: {
      reportId: report.id,
      date: tripDate,
      category: "Kilométrage",
      description: `Déplacement — ${org.name} (non facturé au client)`,
      amount,
      currency: "CAD",
      isBillable: false, // pas refacturé au client
      organizationId: org.id,
      // pas de ticketId — intentionnel (client non facturé)
    },
    select: { id: true, amount: true },
  });

  // Recalcule le total du rapport.
  const totals = await prisma.expenseEntry.aggregate({
    where: { reportId: report.id },
    _sum: { amount: true },
  });
  await prisma.expenseReport.update({
    where: { id: report.id },
    data: { totalAmount: totals._sum.amount ?? 0 },
  });

  return NextResponse.json({
    ok: true,
    entryId: entry.id,
    amount: entry.amount,
    reportId: report.id,
  });
}
