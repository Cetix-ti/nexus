// ============================================================================
// GET /api/v1/intelligence/category-learning
//
// État de l'apprentissage du triage catégorie : avoidances token×cat,
// volume feedback 30j, top catégories les plus signalées.
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

  const [avoidanceRows, feedbackRows] = await Promise.all([
    prisma.aiPattern.findMany({
      where: {
        scope: "learned:category_suggest",
        kind: "avoid_token_for_category",
      },
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
        scope: "category:feedback",
        kind: "pair",
        createdAt: { gte: since30d },
      },
      select: { value: true, createdAt: true },
    }),
  ]);

  // Résout les noms de catégorie
  const categoryIds = new Set<string>();
  for (const r of avoidanceRows) {
    const v = r.value as { categoryId?: string } | null;
    if (v?.categoryId) categoryIds.add(v.categoryId);
  }
  for (const r of feedbackRows) {
    const v = r.value as { suggestedCategoryId?: string } | null;
    if (v?.suggestedCategoryId) categoryIds.add(v.suggestedCategoryId);
  }
  const categories = await prisma.category.findMany({
    where: { id: { in: Array.from(categoryIds) } },
    select: { id: true, name: true, parentId: true },
  });
  const catById = new Map(categories.map((c) => [c.id, c]));
  const pathOf = (id: string): string => {
    const parts: string[] = [];
    let cur = catById.get(id);
    while (cur) {
      parts.unshift(cur.name);
      if (!cur.parentId) break;
      cur = catById.get(cur.parentId);
    }
    return parts.join(" > ") || id;
  };

  const avoidances = avoidanceRows
    .map((r) => {
      const v = r.value as {
        token?: string;
        categoryId?: string;
        badCount?: number;
        goodCount?: number;
        strength?: number;
      } | null;
      if (!v?.token || !v?.categoryId) return null;
      return {
        key: r.key,
        token: v.token,
        categoryId: v.categoryId,
        categoryPath: pathOf(v.categoryId),
        badCount: v.badCount ?? 0,
        goodCount: v.goodCount ?? 0,
        strength: v.strength ?? 0,
        sampleCount: r.sampleCount,
        updatedAt: r.lastUpdatedAt.toISOString(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Volume par jour + totaux + top categories
  const dailyBuckets = new Map<string, { bad: number; good: number }>();
  const byCategory = new Map<string, { bad: number; good: number }>();
  let totalBad = 0;
  let totalGood = 0;

  for (const r of feedbackRows) {
    const v = r.value as {
      suggestedCategoryId?: string;
      verdict?: string;
    } | null;
    if (!v?.suggestedCategoryId || !v?.verdict) continue;
    const day = r.createdAt.toISOString().slice(0, 10);
    const dayBucket = dailyBuckets.get(day) ?? { bad: 0, good: 0 };
    const catBucket = byCategory.get(v.suggestedCategoryId) ?? {
      bad: 0,
      good: 0,
    };
    if (v.verdict === "bad") {
      totalBad++;
      dayBucket.bad++;
      catBucket.bad++;
    } else if (v.verdict === "good") {
      totalGood++;
      dayBucket.good++;
      catBucket.good++;
    }
    dailyBuckets.set(day, dayBucket);
    byCategory.set(v.suggestedCategoryId, catBucket);
  }

  const dailyTrend = Array.from(dailyBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([day, counts]) => ({ day, ...counts }));

  const topCategories = Array.from(byCategory.entries())
    .filter(([, c]) => c.bad >= 2)
    .sort(([, a], [, b]) => b.bad - a.bad)
    .slice(0, 10)
    .map(([catId, c]) => ({
      categoryId: catId,
      categoryPath: pathOf(catId),
      badCount: c.bad,
      goodCount: c.good,
    }));

  return NextResponse.json({
    avoidances,
    dailyTrend,
    totals: { bad: totalBad, good: totalGood, total: totalBad + totalGood },
    topCategories,
  });
}
