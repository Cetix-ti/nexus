// ============================================================================
// GET /api/v1/finances/labor-cost
//
// Feuille de temps agrégée par technicien sur une période.
// Pour chaque agent staff, calcule :
//   - hoursLogged    : total des heures saisies (durée brute)
//   - hoursBilled    : heures facturables (coverage = billable)
//   - hoursTravel    : heures de déplacement facturé (qui consomment
//                       quand même du salaire)
//   - revenue        : montant facturé au client (somme des amount
//                       sur les coverage facturables)
//   - cost           : coût main-d'œuvre (somme des costAmount snapshot)
//   - margin         : revenue - cost
//   - hourlyCost     : taux horaire courant de l'agent (peut différer
//                       du costRateUsed historique des entries)
//
// Query params :
//   ?days=N    : fenêtre roulante (défaut 30)
//   ?from=...  : ISO date début (override de days)
//   ?to=...    : ISO date fin
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasCapability } from "@/lib/auth-utils";
import { isBillable } from "@/lib/billing/coverage-statuses";
import { UserRole } from "@prisma/client";

const STAFF_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.MSP_ADMIN, UserRole.SUPERVISOR, UserRole.TECHNICIAN];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasCapability(me, "finances")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = req.nextUrl;
  const days = Number(url.searchParams.get("days") ?? 30);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const now = new Date();
  const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - days * 24 * 3600 * 1000);
  const to = toParam ? new Date(toParam) : now;

  const [staff, entries] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        role: true, isActive: true, hourlyCost: true, avatar: true,
      },
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }],
    }),
    prisma.timeEntry.findMany({
      where: { startedAt: { gte: from, lte: to } },
      select: {
        agentId: true,
        durationMinutes: true,
        travelDurationMinutes: true,
        hasTravelBilled: true,
        coverageStatus: true,
        amount: true,
        costAmount: true,
      },
    }),
  ]);

  // Agrégation par agent.
  type Agg = {
    minutesLogged: number;
    minutesBilled: number;
    minutesTravel: number;
    revenue: number;
    cost: number;
    entryCount: number;
  };
  const aggByAgent = new Map<string, Agg>();
  for (const e of entries) {
    let a = aggByAgent.get(e.agentId);
    if (!a) {
      a = { minutesLogged: 0, minutesBilled: 0, minutesTravel: 0, revenue: 0, cost: 0, entryCount: 0 };
      aggByAgent.set(e.agentId, a);
    }
    a.minutesLogged += e.durationMinutes;
    if (e.hasTravelBilled && e.travelDurationMinutes) {
      a.minutesTravel += e.travelDurationMinutes;
    }
    if (isBillable(e.coverageStatus)) {
      a.minutesBilled += e.durationMinutes;
      a.revenue += e.amount ?? 0;
    }
    a.cost += e.costAmount ?? 0;
    a.entryCount++;
  }

  const rows = staff.map((s) => {
    const a = aggByAgent.get(s.id) ?? {
      minutesLogged: 0, minutesBilled: 0, minutesTravel: 0,
      revenue: 0, cost: 0, entryCount: 0,
    };
    const hoursLogged = Math.round((a.minutesLogged / 60) * 100) / 100;
    const hoursBilled = Math.round((a.minutesBilled / 60) * 100) / 100;
    const hoursTravel = Math.round((a.minutesTravel / 60) * 100) / 100;
    const revenue = Math.round(a.revenue * 100) / 100;
    const cost = Math.round(a.cost * 100) / 100;
    const margin = Math.round((revenue - cost) * 100) / 100;
    const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;
    return {
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      email: s.email,
      role: s.role,
      isActive: s.isActive,
      avatar: s.avatar,
      hourlyCost: s.hourlyCost,
      hoursLogged,
      hoursBilled,
      hoursTravel,
      entryCount: a.entryCount,
      revenue,
      cost,
      margin,
      marginPct,
    };
  });

  // Totaux
  const totals = rows.reduce(
    (t, r) => ({
      hoursLogged: t.hoursLogged + r.hoursLogged,
      hoursBilled: t.hoursBilled + r.hoursBilled,
      hoursTravel: t.hoursTravel + r.hoursTravel,
      revenue: t.revenue + r.revenue,
      cost: t.cost + r.cost,
      margin: t.margin + r.margin,
    }),
    { hoursLogged: 0, hoursBilled: 0, hoursTravel: 0, revenue: 0, cost: 0, margin: 0 },
  );
  totals.hoursLogged = Math.round(totals.hoursLogged * 100) / 100;
  totals.hoursBilled = Math.round(totals.hoursBilled * 100) / 100;
  totals.hoursTravel = Math.round(totals.hoursTravel * 100) / 100;
  totals.revenue = Math.round(totals.revenue * 100) / 100;
  totals.cost = Math.round(totals.cost * 100) / 100;
  totals.margin = Math.round(totals.margin * 100) / 100;

  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString(), days },
    rows,
    totals,
  });
}
