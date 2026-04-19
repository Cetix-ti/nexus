// ============================================================================
// GET /api/v1/intelligence/feedback
//
// Vue agrégée de TOUS les feedbacks explicites collectés par les widgets
// de la fiche ticket. Admin uniquement.
//
// Sources scannées :
//   - similar:feedback          (tickets similaires)
//   - category:feedback         (suggestion catégorie)
//   - kb:feedback               (articles KB)
//   - triage:feedback:priority  (priorité)
//   - triage:feedback:duplicate (doublon)
//   - triage:feedback:type      (type de ticket)
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

const SCOPES: Array<{ scope: string; label: string }> = [
  { scope: "similar:feedback", label: "Tickets similaires" },
  { scope: "category:feedback", label: "Catégorie suggérée" },
  { scope: "kb:feedback", label: "Articles KB" },
  { scope: "triage:feedback:priority", label: "Priorité" },
  { scope: "triage:feedback:duplicate", label: "Doublon" },
  { scope: "triage:feedback:type", label: "Type" },
];

interface FeedbackValue {
  verdict?: string;
  userId?: string;
  markedAt?: string;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since30d = new Date(Date.now() - 30 * 24 * 3600_000);
  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: { in: SCOPES.map((s) => s.scope) },
      kind: "pair",
      createdAt: { gte: since30d },
    },
    select: { scope: true, value: true, createdAt: true },
  });

  // Par feature × verdict
  const bySource = new Map<string, { bad: number; good: number }>();
  // Par jour × verdict (toutes sources)
  const byDay = new Map<string, { bad: number; good: number }>();
  // Par userId (leaderboard engagement)
  const byUser = new Map<string, { bad: number; good: number }>();

  let totalBad = 0;
  let totalGood = 0;

  for (const r of rows) {
    const v = r.value as FeedbackValue | null;
    if (!v?.verdict || (v.verdict !== "bad" && v.verdict !== "good")) continue;
    const isBad = v.verdict === "bad";

    const srcBucket = bySource.get(r.scope) ?? { bad: 0, good: 0 };
    if (isBad) srcBucket.bad++;
    else srcBucket.good++;
    bySource.set(r.scope, srcBucket);

    const day = r.createdAt.toISOString().slice(0, 10);
    const dayBucket = byDay.get(day) ?? { bad: 0, good: 0 };
    if (isBad) dayBucket.bad++;
    else dayBucket.good++;
    byDay.set(day, dayBucket);

    if (v.userId) {
      const userBucket = byUser.get(v.userId) ?? { bad: 0, good: 0 };
      if (isBad) userBucket.bad++;
      else userBucket.good++;
      byUser.set(v.userId, userBucket);
    }

    if (isBad) totalBad++;
    else totalGood++;
  }

  const sources = SCOPES.map((s) => ({
    scope: s.scope,
    label: s.label,
    bad: bySource.get(s.scope)?.bad ?? 0,
    good: bySource.get(s.scope)?.good ?? 0,
  }));

  const dailyTrend = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([day, c]) => ({ day, ...c }));

  // Enrichit le leaderboard users
  const userIds = Array.from(byUser.keys()).slice(0, 50);
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const leaderboard = Array.from(byUser.entries())
    .map(([userId, c]) => {
      const u = userById.get(userId);
      const name = u
        ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email
        : "(inconnu)";
      return {
        userId,
        name,
        bad: c.bad,
        good: c.good,
        total: c.bad + c.good,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return NextResponse.json({
    totals: { bad: totalBad, good: totalGood, total: totalBad + totalGood },
    sources,
    dailyTrend,
    leaderboard,
  });
}
