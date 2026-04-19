// ============================================================================
// GET /api/v1/intelligence/recurring
//
// Liste tous les patterns récurrents détectés par `recurring-detector`,
// groupés par organisation. Enrichit avec nom d'org et 3 tickets exemple.
// Admin uniquement.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

interface PatternValue {
  clusterSize?: number;
  firstSeen?: string;
  lastSeen?: string;
  spanDays?: number;
  avgGapDays?: number;
  ticketIds?: string[];
  exampleSubjects?: string[];
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.aiPattern.findMany({
    where: { scope: { startsWith: "recurring:" }, kind: "pattern" },
    orderBy: { confidence: "desc" },
    take: 200,
    select: {
      scope: true,
      key: true,
      value: true,
      sampleCount: true,
      confidence: true,
      lastUpdatedAt: true,
    },
  });

  const orgIds = Array.from(
    new Set(rows.map((r) => r.scope.replace(/^recurring:/, ""))),
  );
  const orgs =
    orgIds.length > 0
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [];
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  const allTicketIds = new Set<string>();
  for (const r of rows) {
    const v = r.value as PatternValue | null;
    if (Array.isArray(v?.ticketIds)) {
      for (const tid of v.ticketIds.slice(0, 5)) allTicketIds.add(tid);
    }
  }
  const tickets =
    allTicketIds.size > 0
      ? await prisma.ticket.findMany({
          where: { id: { in: Array.from(allTicketIds) } },
          select: { id: true, number: true, subject: true, createdAt: true },
        })
      : [];
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  const patterns = rows
    .map((r) => {
      const orgId = r.scope.replace(/^recurring:/, "");
      const v = r.value as PatternValue | null;
      if (!v || !Array.isArray(v.ticketIds) || v.ticketIds.length === 0)
        return null;
      return {
        patternId: r.key,
        organizationId: orgId,
        organizationName: orgNameById.get(orgId) ?? "(inconnu)",
        clusterSize: v.clusterSize ?? v.ticketIds.length,
        spanDays: v.spanDays ?? 0,
        avgGapDays: v.avgGapDays ?? null,
        firstSeen: v.firstSeen ?? null,
        lastSeen: v.lastSeen ?? null,
        exampleSubjects: v.exampleSubjects ?? [],
        confidence: r.confidence,
        updatedAt: r.lastUpdatedAt.toISOString(),
        exampleTickets: v.ticketIds
          .slice(0, 5)
          .map((tid) => ticketById.get(tid))
          .filter((t): t is NonNullable<typeof t> => !!t)
          .map((t) => ({
            id: t.id,
            number: t.number,
            subject: t.subject,
            createdAt: t.createdAt.toISOString(),
          })),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ patterns });
}
