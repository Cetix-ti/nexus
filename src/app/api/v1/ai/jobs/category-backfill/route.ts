import { requireAiPermission } from "@/lib/permissions/ai-guard";
// ============================================================================
// /api/v1/ai/jobs/category-backfill
//
// GET  → stats { remaining, totalTicketsWithCategory, totalTickets }.
// POST ?limit=25 → traite un lot et renvoie la progression.
//
// Admin SA / MSP_ADMIN uniquement. Pas de cron — le backfill se déclenche
// en cliquant dans Paramètres > Intelligence IA, et l'UI enchaîne les
// appels jusqu'à `remaining=0`.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import {
  countCategorizableTicketsWithoutCategory,
  runCategoryBackfill,
} from "@/lib/ai/jobs/category-backfill";

function canRun(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN";
}

export async function GET() {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (!canRun(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [remaining, totalTickets, withCategory] = await Promise.all([
    countCategorizableTicketsWithoutCategory(),
    prisma.ticket.count({ where: { status: { not: "DELETED" } } }),
    prisma.ticket.count({
      where: { status: { not: "DELETED" }, categoryId: { not: null } },
    }),
  ]);

  return NextResponse.json({
    remaining,
    totalTickets,
    totalWithCategory: withCategory,
    coveragePct: totalTickets > 0 ? Math.round((withCategory / totalTickets) * 100) : 0,
  });
}

export async function POST(req: NextRequest) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (!canRun(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(parseInt(limitParam, 10) || 25, 50)) : 25;

  const result = await runCategoryBackfill({ batchSize: limit });
  return NextResponse.json({ success: true, ...result });
}
