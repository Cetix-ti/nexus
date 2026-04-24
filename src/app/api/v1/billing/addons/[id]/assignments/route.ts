// ============================================================================
// /api/v1/billing/addons/[id]/assignments
//
// GET    → liste des organisations qui souscrivent à cet addon.
// Utile pour le catalogue : voir d'un coup quelles orgs ont cet addon actif.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN" && me.role !== "SUPERVISOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const rows = await prisma.organizationAddon.findMany({
    where: { addonId: id },
    include: {
      organization: { select: { id: true, name: true } },
      addon: { select: { defaultMonthlyPrice: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organization.name,
      quantity: r.quantity,
      monthlyPrice: r.monthlyPrice ?? r.addon.defaultMonthlyPrice,
      effectivePrice: (r.monthlyPrice ?? r.addon.defaultMonthlyPrice) * r.quantity,
      isPriceOverridden: r.monthlyPrice !== null,
      startDate: r.startDate?.toISOString() ?? null,
      endDate: r.endDate?.toISOString() ?? null,
      notes: r.notes ?? "",
      active: r.active,
    })),
  });
}
