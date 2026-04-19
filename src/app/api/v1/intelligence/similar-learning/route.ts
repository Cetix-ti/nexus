// ============================================================================
// GET /api/v1/intelligence/similar-learning
//
// Vue admin de l'état de l'apprentissage du widget "Tickets similaires" :
//   - Tokens pénalisés par le learner (avec force, bad/good count)
//   - Volume de feedback des 30 derniers jours (bad vs good)
//   - Top 10 paires de tickets les plus marquées "bad" (récurrence)
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since30d = new Date(Date.now() - 30 * 24 * 3600_000);

  const [penaltyRows, feedbackRows] = await Promise.all([
    prisma.aiPattern.findMany({
      where: { scope: "learned:similar", kind: "penalty_token" },
      orderBy: { confidence: "desc" },
      select: {
        key: true,
        value: true,
        lastUpdatedAt: true,
        sampleCount: true,
      },
    }),
    prisma.aiPattern.findMany({
      where: {
        scope: "similar:feedback",
        kind: "pair",
        createdAt: { gte: since30d },
      },
      select: { value: true, createdAt: true },
    }),
  ]);

  // Tokens pénalisés
  const penalties = penaltyRows
    .map((r) => {
      const v = r.value as {
        token?: string;
        badCount?: number;
        goodCount?: number;
        penaltyStrength?: number;
        learnedAt?: string;
      } | null;
      if (!v) return null;
      return {
        token: r.key,
        badCount: v.badCount ?? 0,
        goodCount: v.goodCount ?? 0,
        penaltyStrength: v.penaltyStrength ?? 0,
        sampleCount: r.sampleCount,
        learnedAt: v.learnedAt ?? r.lastUpdatedAt.toISOString(),
        updatedAt: r.lastUpdatedAt.toISOString(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Volume feedback par jour + totaux
  const dailyBuckets = new Map<string, { bad: number; good: number }>();
  let totalBad = 0;
  let totalGood = 0;
  const pairCounts = new Map<
    string,
    { sourceId: string; suggestedId: string; bad: number; good: number }
  >();

  for (const r of feedbackRows) {
    const v = r.value as {
      sourceTicketId?: string;
      suggestedTicketId?: string;
      verdict?: string;
    } | null;
    if (!v?.sourceTicketId || !v?.suggestedTicketId) continue;
    const day = r.createdAt.toISOString().slice(0, 10);
    const bucket = dailyBuckets.get(day) ?? { bad: 0, good: 0 };
    const pairKey = `${v.sourceTicketId}|${v.suggestedTicketId}`;
    const pair = pairCounts.get(pairKey) ?? {
      sourceId: v.sourceTicketId,
      suggestedId: v.suggestedTicketId,
      bad: 0,
      good: 0,
    };
    if (v.verdict === "bad") {
      totalBad++;
      bucket.bad++;
      pair.bad++;
    } else if (v.verdict === "good") {
      totalGood++;
      bucket.good++;
      pair.good++;
    }
    dailyBuckets.set(day, bucket);
    pairCounts.set(pairKey, pair);
  }

  const dailyTrend = Array.from(dailyBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([day, counts]) => ({ day, ...counts }));

  // Top bad-pairs
  const topPairs = Array.from(pairCounts.values())
    .filter((p) => p.bad >= 2)
    .sort((a, b) => b.bad - a.bad)
    .slice(0, 15);

  // Enrichit les top pairs avec les détails tickets
  const topPairTicketIds = new Set<string>();
  for (const p of topPairs) {
    topPairTicketIds.add(p.sourceId);
    topPairTicketIds.add(p.suggestedId);
  }
  const tickets =
    topPairTicketIds.size > 0
      ? await prisma.ticket.findMany({
          where: { id: { in: Array.from(topPairTicketIds) } },
          select: { id: true, number: true, subject: true },
        })
      : [];
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const topPairsEnriched = topPairs
    .map((p) => {
      const src = ticketById.get(p.sourceId);
      const sug = ticketById.get(p.suggestedId);
      if (!src || !sug) return null;
      return {
        source: { id: src.id, number: src.number, subject: src.subject },
        suggested: {
          id: sug.id,
          number: sug.number,
          subject: sug.subject,
        },
        badCount: p.bad,
        goodCount: p.good,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({
    penalties,
    dailyTrend,
    totals: { bad: totalBad, good: totalGood, total: totalBad + totalGood },
    topPairs: topPairsEnriched,
  });
}
