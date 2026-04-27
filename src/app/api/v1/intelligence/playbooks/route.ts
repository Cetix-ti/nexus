// ============================================================================
// GET /api/v1/intelligence/playbooks
//
// Liste tous les playbooks extraits automatiquement par `playbook-miner`,
// groupés par catégorie. Enrichit avec le chemin de catégorie et les
// ticket sources. Admin uniquement.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

interface Playbook {
  title: string;
  symptoms: string[];
  diagnosticSteps: string[];
  resolutionSteps: string[];
  commands: Array<{ platform: string; command: string; purpose: string }>;
  prevention: string[];
  sourceTicketIds: string[];
}

export async function GET() {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.aiPattern.findMany({
    where: { scope: { startsWith: "playbook:" }, kind: "playbook" },
    orderBy: { lastUpdatedAt: "desc" },
    take: 100,
    select: {
      scope: true,
      key: true,
      value: true,
      sampleCount: true,
      confidence: true,
      lastUpdatedAt: true,
    },
  });

  const categoryIds = Array.from(
    new Set(rows.map((r) => r.scope.replace(/^playbook:/, ""))),
  );
  const categories =
    categoryIds.length > 0
      ? await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, parentId: true },
        })
      : [];
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

  const allTicketIds = new Set<string>();
  for (const r of rows) {
    const v = r.value as Partial<Playbook> | null;
    if (Array.isArray(v?.sourceTicketIds)) {
      for (const tid of v.sourceTicketIds) allTicketIds.add(tid);
    }
  }
  const tickets =
    allTicketIds.size > 0
      ? await prisma.ticket.findMany({
          where: { id: { in: Array.from(allTicketIds) } },
          select: { id: true, number: true, subject: true },
        })
      : [];
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  const playbooks = rows
    .map((r) => {
      const catId = r.scope.replace(/^playbook:/, "");
      const v = r.value as Playbook | null;
      if (!v || typeof v.title !== "string") return null;
      const sourceTickets = (v.sourceTicketIds ?? [])
        .map((tid) => ticketById.get(tid))
        .filter((t): t is NonNullable<typeof t> => !!t);
      return {
        playbookId: r.key,
        categoryId: catId,
        categoryPath: pathOf(catId),
        title: v.title,
        symptoms: v.symptoms ?? [],
        diagnosticSteps: v.diagnosticSteps ?? [],
        resolutionSteps: v.resolutionSteps ?? [],
        commands: v.commands ?? [],
        prevention: v.prevention ?? [],
        sampleCount: r.sampleCount,
        confidence: r.confidence,
        updatedAt: r.lastUpdatedAt.toISOString(),
        sourceTickets,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ playbooks });
}
