// ============================================================================
// GET /api/v1/tickets/[id]/dedup-cluster
//
// Retourne le cluster de duplicates probables qui contient ce ticket, OU
// null si aucun cluster ne le contient. Enrichit avec les sujets + numéros
// des autres tickets du cluster.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getDedupClusterForTicket } from "@/lib/ai/jobs/cross-source-dedup";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const cluster = await getDedupClusterForTicket(id);
  if (!cluster) return NextResponse.json({ cluster: null });

  // Enrichit avec les métadonnées tickets (number, subject, source, status).
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: cluster.ticketIds } },
    select: {
      id: true,
      number: true,
      subject: true,
      source: true,
      status: true,
      createdAt: true,
      assignee: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });

  const siblings = tickets
    .filter((t) => t.id !== id)
    .map((t) => ({
      id: t.id,
      number: t.number,
      subject: t.subject,
      source: String(t.source),
      status: String(t.status),
      createdAt: t.createdAt.toISOString(),
      assigneeName: t.assignee
        ? `${t.assignee.firstName ?? ""} ${t.assignee.lastName ?? ""}`.trim() ||
          t.assignee.email
        : null,
      isMaster: t.id === cluster.masterTicketId,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const thisIsMaster = id === cluster.masterTicketId;
  const master = tickets.find((t) => t.id === cluster.masterTicketId) ?? null;

  return NextResponse.json({
    cluster: {
      clusterId: cluster.clusterId,
      thisIsMaster,
      masterTicket: master
        ? {
            id: master.id,
            number: master.number,
            subject: master.subject,
          }
        : null,
      siblings,
      signals: cluster.signals,
      confidence: cluster.confidence,
      summary: cluster.summary,
      detectedAt: cluster.detectedAt,
    },
  });
}
