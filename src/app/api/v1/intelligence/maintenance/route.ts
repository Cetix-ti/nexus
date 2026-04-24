// ============================================================================
// GET /api/v1/intelligence/maintenance
//
// Retourne toutes les suggestions de maintenance ouvertes, triées par impact
// client. Super-admin / msp-admin uniquement.
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

  const rows = await prisma.aiPattern.findMany({
    where: { scope: "maintenance:suggestion", kind: "item" },
    orderBy: { lastUpdatedAt: "desc" },
    take: 200,
    select: { key: true, value: true, lastUpdatedAt: true },
  });

  interface Suggestion {
    suggestionId?: string;
    organizationId?: string;
    basis?: string;
    title?: string;
    rationale?: string;
    expectedBenefit?: string;
    estimatedEffort?: string;
    clientImpact?: string;
    evidenceTicketIds?: string[];
    assetIds?: string[];
    status?: string;
    confidence?: number;
    detectedAt?: string;
  }

  const suggestions: Array<Suggestion & { updatedAt: string }> = [];
  const orgIds = new Set<string>();
  const allEvidenceIds = new Set<string>();
  for (const r of rows) {
    const v = r.value as Suggestion | null;
    if (!v) continue;
    if (v.organizationId) orgIds.add(v.organizationId);
    for (const tid of v.evidenceTicketIds ?? []) allEvidenceIds.add(tid);
    suggestions.push({ ...v, updatedAt: r.lastUpdatedAt.toISOString() });
  }

  const [orgs, evidenceTickets] = await Promise.all([
    orgIds.size > 0
      ? prisma.organization.findMany({
          where: { id: { in: Array.from(orgIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    allEvidenceIds.size > 0
      ? prisma.ticket.findMany({
          where: { id: { in: Array.from(allEvidenceIds) } },
          select: { id: true, number: true, subject: true },
        })
      : Promise.resolve([]),
  ]);
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
  const ticketById = new Map(
    evidenceTickets.map((t) => [t.id, { id: t.id, number: t.number, subject: t.subject }]),
  );

  // Enrichis avec le nom d'org + numéros de tickets de référence, et filtre
  // les orphelins.
  const enriched = suggestions
    .map((s) => ({
      ...s,
      organizationName:
        s.organizationId ? orgNameById.get(s.organizationId) ?? null : null,
      evidenceTickets: (s.evidenceTicketIds ?? [])
        .map((tid) => ticketById.get(tid))
        .filter((t): t is { id: string; number: number; subject: string } => !!t),
    }))
    .filter((s) => s.suggestionId);

  return NextResponse.json({
    open: enriched.filter((s) => s.status === "open"),
    accepted: enriched.filter((s) => s.status === "accepted"),
    rejected: enriched.filter((s) => s.status === "rejected").slice(0, 50),
  });
}
