// ============================================================================
// GET /api/v1/intelligence/clients/[id]
//
// Vue 360° d'un client pour /intelligence/clients/[id] :
//   - Score de santé + breakdown par composante
//   - Historique (sparkline) des 30 derniers snapshots
//   - SLA implicite appris
//   - Anomalies requester récentes
//   - Tickets à risque SLA ouverts
//   - Suggestions de maintenance ouvertes
//   - Patterns récurrents détectés
//   - Vocabulaire technique mémorisé
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [
    healthRow,
    implicitSlaRow,
    recurringPatterns,
    maintenanceRows,
    anomalies,
    vocabularyFacts,
  ] = await Promise.all([
    prisma.aiPattern.findUnique({
      where: {
        scope_kind_key: {
          scope: "client:health",
          kind: "score",
          key: id,
        },
      },
      select: { value: true, lastUpdatedAt: true },
    }),
    prisma.aiPattern.findUnique({
      where: {
        scope_kind_key: {
          scope: "sla:implicit",
          kind: "org",
          key: id,
        },
      },
      select: { value: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: `recurring:${id}`, kind: "pattern" },
      select: { value: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: "maintenance:suggestion", kind: "item" },
      select: { value: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: "requester:anomaly", kind: "event" },
      orderBy: { lastUpdatedAt: "desc" },
      take: 50,
      select: { value: true, lastUpdatedAt: true },
    }),
    prisma.aiMemory.findMany({
      where: {
        scope: `org:${id}`,
        category: "vocabulary",
        verifiedAt: { not: null },
        rejectedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { content: true, source: true },
    }),
  ]);

  // Filter maintenance + anomalies by org.
  const maintenanceOut = maintenanceRows
    .map((r) => r.value as Record<string, unknown> | null)
    .filter((v): v is Record<string, unknown> => !!v)
    .filter((v) => v.organizationId === id && v.status === "open");

  const anomaliesOut = anomalies
    .map((r) => r.value as Record<string, unknown> | null)
    .filter((v): v is Record<string, unknown> => !!v)
    .filter((v) => v.organizationId === id);

  // Tickets à risque SLA pour cet org.
  const slaRisksRows = await prisma.aiPattern.findMany({
    where: { scope: "sla:risk", kind: "ticket" },
    select: { value: true },
  });
  const slaRisksOut = slaRisksRows
    .map((r) => r.value as Record<string, unknown> | null)
    .filter((v): v is Record<string, unknown> => !!v)
    .filter((v) => v.organizationId === id)
    .sort(
      (a, b) =>
        ((b.riskScore as number) ?? 0) - ((a.riskScore as number) ?? 0),
    );

  // Ticket counts (open, resolved last 30d, etc.) pour cadre général.
  const since30d = new Date(Date.now() - 30 * 24 * 3600_000);
  const [openTickets, resolved30d, created30d] = await Promise.all([
    prisma.ticket.count({
      where: {
        organizationId: id,
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
      },
    }),
    prisma.ticket.count({
      where: {
        organizationId: id,
        resolvedAt: { gte: since30d, not: null },
      },
    }),
    prisma.ticket.count({
      where: { organizationId: id, createdAt: { gte: since30d } },
    }),
  ]);

  return NextResponse.json({
    org,
    health: healthRow?.value ?? null,
    healthUpdatedAt: healthRow?.lastUpdatedAt ?? null,
    implicitSla: implicitSlaRow?.value ?? null,
    recurringPatterns: recurringPatterns
      .map((r) => r.value as Record<string, unknown> | null)
      .filter((v): v is Record<string, unknown> => !!v),
    maintenanceSuggestions: maintenanceOut,
    requesterAnomalies: anomaliesOut,
    slaRisks: slaRisksOut,
    vocabulary: vocabularyFacts,
    kpis: {
      openTickets,
      resolved30d,
      created30d,
    },
  });
}
