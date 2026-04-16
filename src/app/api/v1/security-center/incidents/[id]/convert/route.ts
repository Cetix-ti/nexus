// POST /api/v1/security-center/incidents/[id]/convert
//
// Convertit un SecurityIncident en Ticket Nexus (mêmes principes que
// /api/v1/backup-templates/[id]/convert) :
//   - sujet = titre incident (peut être override via body.subject)
//   - description = résumé + liste des N dernières alertes avec timestamps
//   - categoryId / priority : override possible via body, sinon défauts
//   - isInternal = false (ticket client de sécurité à suivre, pas tâche admin)
//   - On lie incident.ticketId → le bouton "Créer ticket" devient "Ouvrir
//     le ticket" après conversion.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { createTicket } from "@/lib/tickets/service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const incident = await prisma.securityIncident.findUnique({
    where: { id },
    include: {
      alerts: { orderBy: { receivedAt: "desc" }, take: 20 },
      organization: true,
    },
  });
  if (!incident) {
    return NextResponse.json({ error: "Incident introuvable" }, { status: 404 });
  }
  if (incident.ticketId) {
    return NextResponse.json(
      { error: "Un ticket a déjà été créé pour cet incident", ticketId: incident.ticketId },
      { status: 409 },
    );
  }
  // L'incident DOIT être rattaché à une organisation pour créer un ticket.
  // Sinon demande à l'admin de mapper l'org depuis l'UI (bouton « Assigner
  // à une organisation » à implémenter).
  if (!incident.organizationId) {
    return NextResponse.json(
      { error: "Incident orphelin — associe-le à une organisation avant de créer un ticket" },
      { status: 412 },
    );
  }

  // Construit la description : contexte + historique compact des alertes.
  const historyLines = incident.alerts
    .map((a) => {
      const date = a.receivedAt.toLocaleString("fr-CA", {
        dateStyle: "short",
        timeStyle: "short",
      });
      return `• ${date} — ${a.title}`;
    })
    .join("\n");
  const description =
    [
      incident.summary ?? "",
      "",
      `Incident : ${incident.title}`,
      incident.endpoint ? `Endpoint : ${incident.endpoint}` : null,
      incident.userPrincipal ? `Utilisateur : ${incident.userPrincipal}` : null,
      incident.software ? `Logiciel : ${incident.software}` : null,
      incident.cveId ? `CVE : ${incident.cveId}` : null,
      "",
      `Nombre de notifications : ${incident.occurrenceCount}`,
      `Première : ${incident.firstSeenAt.toLocaleString("fr-CA")}`,
      `Dernière : ${incident.lastSeenAt.toLocaleString("fr-CA")}`,
      "",
      "Historique :",
      historyLines,
    ]
      .filter((l) => l !== null)
      .join("\n");

  const subject = (typeof body.subject === "string" && body.subject.trim())
    ? body.subject.trim()
    : incident.title;

  // Priorité par défaut selon la sévérité — critical → high, high → medium,
  // reste → low. Adaptable via body.priority.
  const severityMap: Record<string, string> = {
    critical: "high",
    high: "medium",
    warning: "low",
    info: "low",
  };
  const priority = body.priority
    ?? (incident.severity ? severityMap[incident.severity] ?? "low" : "low");

  const ticket = await createTicket({
    organizationId: incident.organizationId,
    subject,
    description,
    status: "new",
    priority,
    type: "incident",
    source: "automation",
    categoryId: body.categoryId ?? null,
    creatorId: me.id,
    isInternal: false,
  });

  await prisma.securityIncident.update({
    where: { id: incident.id },
    data: { ticketId: ticket.id, status: "investigating" },
  });

  return NextResponse.json(ticket, { status: 201 });
}
