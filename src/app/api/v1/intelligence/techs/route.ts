// ============================================================================
// GET /api/v1/intelligence/techs
//
// Liste de tous les techniciens actifs avec leur profil coaching :
//   - Charge actuelle (tickets ouverts)
//   - Nombre total de tickets résolus (all-time)
//   - Nombre de catégories maîtrisées (expertise ≥ 0.5)
//   - Top 3 catégories les plus fortes
//   - SLA risks assignés
//   - Indicateur santé (load, risks)
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

  const techs = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR", "TECHNICIAN"] },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  if (techs.length === 0) return NextResponse.json({ techs: [] });

  const techIds = techs.map((t) => t.id);

  const [expertiseRows, openLoadRows, categories, slaRisksRows] =
    await Promise.all([
      prisma.aiPattern.findMany({
        where: {
          scope: "workload:expertise",
          kind: "tech",
          key: { in: techIds },
        },
        select: { key: true, value: true, lastUpdatedAt: true },
      }),
      prisma.ticket.groupBy({
        by: ["assigneeId"],
        where: {
          assigneeId: { in: techIds },
          status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
        },
        _count: { id: true },
      }),
      prisma.category.findMany({
        select: { id: true, name: true, parentId: true },
      }),
      prisma.aiPattern.findMany({
        where: { scope: "sla:risk", kind: "ticket" },
        select: { value: true },
      }),
    ]);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const pathOf = (id: string): string => {
    const parts: string[] = [];
    let cur = catById.get(id);
    while (cur) {
      parts.unshift(cur.name);
      if (!cur.parentId) break;
      cur = catById.get(cur.parentId);
    }
    return parts.join(" > ");
  };

  const expertiseByTech = new Map<
    string,
    {
      byCategory: Record<string, { expertise: number; resolvedCount: number }>;
      totalResolved?: number;
      updatedAt: string;
    }
  >();
  for (const e of expertiseRows) {
    const v = e.value as {
      byCategory?: Record<string, { expertise: number; resolvedCount: number }>;
      totalResolved?: number;
    } | null;
    if (v) {
      expertiseByTech.set(e.key, {
        byCategory: v.byCategory ?? {},
        totalResolved: v.totalResolved,
        updatedAt: e.lastUpdatedAt.toISOString(),
      });
    }
  }

  const loadByTech = new Map<string, number>();
  for (const l of openLoadRows) {
    if (l.assigneeId) loadByTech.set(l.assigneeId, l._count.id ?? 0);
  }

  // SLA risks par tech (compte des risques assignés)
  const slaCountByTech = new Map<
    string,
    { total: number; critical: number }
  >();
  for (const r of slaRisksRows) {
    const v = r.value as { assigneeId?: string; riskScore?: number } | null;
    if (!v?.assigneeId) continue;
    const cur = slaCountByTech.get(v.assigneeId) ?? {
      total: 0,
      critical: 0,
    };
    cur.total++;
    if ((v.riskScore ?? 0) >= 0.85) cur.critical++;
    slaCountByTech.set(v.assigneeId, cur);
  }

  const out = techs.map((t) => {
    const exp = expertiseByTech.get(t.id);
    const byCat = exp?.byCategory ?? {};
    const categoriesMastered = Object.values(byCat).filter(
      (c) => c.expertise >= 0.5,
    ).length;
    const top3 = Object.entries(byCat)
      .sort((a, b) => b[1].expertise - a[1].expertise)
      .slice(0, 3)
      .map(([catId, stats]) => ({
        categoryId: catId,
        categoryPath: pathOf(catId),
        expertise: stats.expertise,
        resolvedCount: stats.resolvedCount,
      }));
    const load = loadByTech.get(t.id) ?? 0;
    const slaRisk = slaCountByTech.get(t.id) ?? { total: 0, critical: 0 };
    const fullName =
      `${t.firstName ?? ""} ${t.lastName ?? ""}`.trim() || t.email;
    return {
      id: t.id,
      name: fullName,
      email: t.email,
      role: t.role,
      totalResolved: exp?.totalResolved ?? 0,
      openLoad: load,
      categoriesMastered,
      totalCategories: Object.keys(byCat).length,
      top3,
      slaRisks: slaRisk,
      profileUpdatedAt: exp?.updatedAt ?? null,
    };
  });

  // Tri : techs avec SLA critiques en premier, puis charge décroissante.
  out.sort((a, b) => {
    if (a.slaRisks.critical !== b.slaRisks.critical)
      return b.slaRisks.critical - a.slaRisks.critical;
    return b.openLoad - a.openLoad;
  });

  return NextResponse.json({ techs: out });
}
