// ============================================================================
// /api/v1/organizations/[id]/billing/recompute
//
// Re-décide la facturation de TOUTES les TimeEntry d'un client pour une
// période donnée (mois "YYYY-MM"). Utile après un changement de taux dans
// l'override : sans ça, les entries existantes gardent leur ancien
// hourlyRate/amount calculé au moment de la saisie.
//
// Préserve les flags factuels (durée, type, isOnsite, isAfterHours, ...) et
// refait passer chaque entry par `resolveDecisionForEntry()`. Met à jour
// coverageStatus, coverageReason, hourlyRate, amount.
//
// Admin uniquement (SUPER_ADMIN ou MSP_ADMIN). Les périodes verrouillées
// (BillingPeriodLock) sont sautées sans erreur.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { resolveDecisionForEntry } from "@/lib/billing/server-decide";
import { checkBillingLock } from "@/lib/billing/period-lock";

interface Ctx {
  params: Promise<{ id: string }>;
}

function monthBounds(period: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error("period must be YYYY-MM");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const start = new Date(y, mo - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, mo, 0, 23, 59, 59, 999);
  return { start, end };
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const period =
    typeof body.period === "string" && /^\d{4}-\d{2}$/.test(body.period)
      ? body.period
      : null;
  if (!period) {
    return NextResponse.json(
      { error: "period requis (format YYYY-MM)" },
      { status: 400 },
    );
  }
  const { start, end } = monthBounds(period);

  const lockMsg = await checkBillingLock(start);
  if (lockMsg) {
    return NextResponse.json(
      { error: `Période verrouillée : ${lockMsg}` },
      { status: 409 },
    );
  }

  // Exclut les entries déjà facturées : leur tarif est figé
  // contractuellement, pas de recompute autorisé.
  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId: id,
      startedAt: { gte: start, lte: end },
      approvalStatus: { not: "invoiced" },
    },
    select: {
      id: true,
      ticketId: true,
      startedAt: true,
      durationMinutes: true,
      timeType: true,
      isOnsite: true,
      isAfterHours: true,
      isWeekend: true,
      isUrgent: true,
      workTypeId: true,
      rateTierId: true,
    },
  });

  let updated = 0;
  let unchanged = 0;
  for (const e of entries) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: e.ticketId },
      select: { categoryId: true },
    });
    const { decision } = await resolveDecisionForEntry({
      organizationId: id,
      timeType: e.timeType,
      durationMinutes: e.durationMinutes,
      startedAt: e.startedAt,
      isOnsite: e.isOnsite,
      isAfterHours: e.isAfterHours,
      isWeekend: e.isWeekend,
      isUrgent: e.isUrgent,
      ticketCategoryId: ticket?.categoryId ?? undefined,
      workTypeId: e.workTypeId,
      rateTierId: e.rateTierId,
    });
    const next = {
      coverageStatus: decision.status,
      coverageReason: decision.reason,
      hourlyRate: decision.rate ?? null,
      amount: decision.amount ?? null,
    };
    const current = await prisma.timeEntry.findUnique({
      where: { id: e.id },
      select: {
        coverageStatus: true,
        coverageReason: true,
        hourlyRate: true,
        amount: true,
      },
    });
    if (
      current &&
      current.coverageStatus === next.coverageStatus &&
      (current.hourlyRate ?? null) === (next.hourlyRate ?? null) &&
      (current.amount ?? null) === (next.amount ?? null)
    ) {
      unchanged++;
      continue;
    }
    await prisma.timeEntry.update({ where: { id: e.id }, data: next });
    updated++;
  }

  return NextResponse.json({
    success: true,
    period,
    counted: entries.length,
    updated,
    unchanged,
  });
}
