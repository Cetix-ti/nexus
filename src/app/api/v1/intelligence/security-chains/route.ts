// ============================================================================
// GET /api/v1/intelligence/security-chains
//
// Liste toutes les chaînes de corrélation sécurité actives, enrichies avec
// les détails des incidents (title, severity, status, source, timestamps).
// Admin uniquement.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

interface Chain {
  chainId: string;
  incidentIds: string[];
  organizationId?: string | null;
  entities?: {
    endpoints?: string[];
    users?: string[];
  };
  sources?: string[];
  timeSpanMs?: number;
  highestSeverity?: string | null;
  summary?: string;
  detectedAt?: string;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.aiPattern.findMany({
    where: { scope: "security:correlation", kind: "chain" },
    orderBy: { lastUpdatedAt: "desc" },
    take: 100,
    select: { value: true, lastUpdatedAt: true },
  });
  const chains = rows
    .map((r) => r.value as Chain | null)
    .filter((c): c is Chain => !!c && Array.isArray(c.incidentIds));

  // Charge en bulk tous les incidents + organisations.
  const allIncidentIds = Array.from(
    new Set(chains.flatMap((c) => c.incidentIds)),
  );
  const incidents =
    allIncidentIds.length > 0
      ? await prisma.securityIncident.findMany({
          where: { id: { in: allIncidentIds } },
          select: {
            id: true,
            source: true,
            kind: true,
            severity: true,
            status: true,
            title: true,
            organizationId: true,
            firstSeenAt: true,
            lastSeenAt: true,
            ticketId: true,
          },
        })
      : [];
  const incidentById = new Map(incidents.map((i) => [i.id, i]));

  const orgIds = Array.from(
    new Set(
      incidents
        .map((i) => i.organizationId)
        .filter((x): x is string => !!x),
    ),
  );
  const orgs =
    orgIds.length > 0
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [];
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  const enriched = chains.map((c) => {
    const incidentDetails = c.incidentIds
      .map((id) => incidentById.get(id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((i) => ({
        id: i.id,
        source: i.source,
        kind: i.kind,
        severity: i.severity,
        status: i.status,
        title: i.title,
        firstSeenAt: i.firstSeenAt.toISOString(),
        lastSeenAt: i.lastSeenAt.toISOString(),
        ticketId: i.ticketId,
      }))
      .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));
    return {
      ...c,
      organizationName: c.organizationId
        ? orgNameById.get(c.organizationId) ?? null
        : null,
      incidents: incidentDetails,
    };
  });

  // Tri : sévérité descendante, puis date descendante.
  const severityRank: Record<string, number> = {
    critical: 3,
    high: 2,
    warning: 1,
    info: 0,
  };
  enriched.sort((a, b) => {
    const sa = severityRank[a.highestSeverity ?? "info"] ?? 0;
    const sb = severityRank[b.highestSeverity ?? "info"] ?? 0;
    if (sa !== sb) return sb - sa;
    return (b.detectedAt ?? "").localeCompare(a.detectedAt ?? "");
  });

  return NextResponse.json({ chains: enriched });
}
