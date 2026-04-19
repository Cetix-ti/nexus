// ============================================================================
// POST /api/v1/intelligence/maintenance/[id]/create-ticket
//
// Transforme une suggestion de maintenance en ticket SERVICE_REQUEST interne
// pré-rempli. Marque la suggestion comme "accepted". Retourne l'ID du ticket
// créé pour redirection côté client.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { updateMaintenanceSuggestionStatus } from "@/lib/ai/jobs/maintenance-suggester";
import { createTicket } from "@/lib/tickets/service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const pattern = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: "maintenance:suggestion",
        kind: "item",
        key: id,
      },
    },
    select: { value: true },
  });
  if (!pattern) return NextResponse.json({ error: "Not found" }, { status: 404 });

  interface Suggestion {
    organizationId?: string;
    title?: string;
    rationale?: string;
    expectedBenefit?: string;
    estimatedEffort?: string;
    clientImpact?: string;
    evidenceTicketIds?: string[];
    assetIds?: string[];
  }
  const v = pattern.value as Suggestion | null;
  if (!v?.organizationId || !v.title) {
    return NextResponse.json({ error: "Invalid suggestion" }, { status: 400 });
  }

  // Compose la description : rationale + bénéfice + liens vers les tickets
  // qui fondent la suggestion (pour traçabilité).
  const parts: string[] = [];
  if (v.rationale) parts.push(`## Justification\n\n${v.rationale}`);
  if (v.expectedBenefit)
    parts.push(`## Bénéfice attendu\n\n${v.expectedBenefit}`);
  if (v.estimatedEffort)
    parts.push(`**Effort estimé :** ${v.estimatedEffort}`);
  if (v.clientImpact) parts.push(`**Impact client :** ${v.clientImpact}`);
  if (v.evidenceTicketIds && v.evidenceTicketIds.length > 0) {
    const evidenceTickets = await prisma.ticket.findMany({
      where: { id: { in: v.evidenceTicketIds } },
      select: { id: true, number: true, subject: true },
    });
    if (evidenceTickets.length > 0) {
      parts.push(
        `## Tickets de référence\n\n${evidenceTickets
          .map((t) => `- [TK-${t.number}](/tickets/${t.id}) — ${t.subject}`)
          .join("\n")}`,
      );
    }
  }
  if (v.assetIds && v.assetIds.length > 0) {
    const assets = await prisma.asset.findMany({
      where: { id: { in: v.assetIds } },
      select: { id: true, name: true, type: true },
    });
    if (assets.length > 0) {
      parts.push(
        `## Actifs concernés\n\n${assets.map((a) => `- ${a.name} (${a.type})`).join("\n")}`,
      );
    }
  }
  parts.push(`---\n\n_Suggestion générée automatiquement par le moteur d'auto-apprentissage Nexus._`);

  const description = parts.join("\n\n");

  // Le client peut ne pas avoir de contact requester identifié — on crée le
  // ticket sans requester, l'admin pourra l'assigner ensuite.
  const created = await createTicket({
    subject: `[Maintenance proposée] ${v.title}`.slice(0, 250),
    description,
    descriptionHtml: null,
    organizationId: v.organizationId,
    requesterId: null,
    assigneeId: null,
    creatorId: me.id,
    type: "service_request",
    priority:
      v.clientImpact === "high"
        ? "high"
        : v.clientImpact === "medium"
          ? "medium"
          : "low",
    source: "AGENT",
    categoryId: null,
    queueId: null,
    isInternal: true, // ticket interne Cetix, pas visible côté portal client
    meetingId: null,
  });

  await updateMaintenanceSuggestionStatus(id, "accepted");

  return NextResponse.json({ ticketId: created.id, ticketNumber: created.number });
}
