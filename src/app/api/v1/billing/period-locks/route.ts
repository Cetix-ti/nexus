// ============================================================================
// GET    /api/v1/billing/period-locks — liste les mois verrouillés
// POST   /api/v1/billing/period-locks — verrouille un mois
// DELETE  /api/v1/billing/period-locks?period=YYYY-MM — déverrouille
//
// SUPER_ADMIN / MSP_ADMIN uniquement.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasCapability } from "@/lib/auth-utils";
import { invalidateLockCache } from "@/lib/billing/period-lock";

function canBilling(me: { role: string; capabilities: string[] }) {
  return me.role === "SUPER_ADMIN" || hasCapability(me as any, "billing");
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canBilling(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.billingPeriodLock.findMany({
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { period: "desc" },
  });
  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canBilling(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { period?: string; notes?: string }
    | null;
  if (!body?.period || !/^\d{4}-\d{2}$/.test(body.period)) {
    return NextResponse.json(
      { error: "period requis au format YYYY-MM" },
      { status: 400 },
    );
  }

  // Ne peut verrouiller que les mois passés (pas le mois en cours).
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (body.period >= currentPeriod) {
    return NextResponse.json(
      { error: "Impossible de verrouiller le mois courant ou un mois futur. Seuls les mois passés peuvent être verrouillés." },
      { status: 400 },
    );
  }

  const existing = await prisma.billingPeriodLock.findUnique({
    where: { period: body.period },
  });
  if (existing) {
    return NextResponse.json({ item: existing, alreadyLocked: true });
  }

  const created = await prisma.billingPeriodLock.create({
    data: {
      period: body.period,
      lockedBy: me.id,
      notes: body.notes || null,
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  invalidateLockCache();
  return NextResponse.json({ item: created }, { status: 201 });
}

export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canBilling(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const period = url.searchParams.get("period");
  if (!period) return NextResponse.json({ error: "period requis" }, { status: 400 });

  await prisma.billingPeriodLock.delete({ where: { period } }).catch(() => null);
  invalidateLockCache();
  return NextResponse.json({ ok: true });
}
