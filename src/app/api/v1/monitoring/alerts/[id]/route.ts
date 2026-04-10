import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const alert = await prisma.monitoringAlert.findUnique({ where: { id } });
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {};
  if (body.stage) data.stage = body.stage;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.isResolved !== undefined) {
    data.isResolved = body.isResolved;
    if (body.isResolved) data.resolvedAt = new Date();
  }
  if (body.ticketId !== undefined) data.ticketId = body.ticketId;

  const updated = await prisma.monitoringAlert.update({ where: { id }, data });
  return NextResponse.json(updated);
}

/** POST — create a ticket linked to this alert */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const alert = await prisma.monitoringAlert.findUnique({ where: { id } });
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Already has a linked ticket?
  if (alert.ticketId) {
    return NextResponse.json({ error: "Un ticket est déjà lié à cette alerte", ticketId: alert.ticketId }, { status: 409 });
  }

  // Find a creator (first admin/tech)
  const creator = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "TECHNICIAN"] }, isActive: true },
    select: { id: true },
  });
  if (!creator) return NextResponse.json({ error: "Aucun agent trouvé" }, { status: 500 });

  // Create ticket
  const orgId = alert.organizationId;
  const ticket = await prisma.ticket.create({
    data: {
      organizationId: orgId || "unknown",
      creatorId: creator.id,
      subject: `[Monitoring] ${alert.subject}`,
      description: `Alerte ${alert.sourceType} détectée le ${alert.receivedAt.toLocaleString("fr-CA")}.\n\nExpéditeur: ${alert.senderEmail}\n\n${alert.body?.slice(0, 2000) || ""}`,
      status: "NEW",
      priority: alert.severity === "CRITICAL" ? "CRITICAL" : alert.severity === "HIGH" ? "HIGH" : "MEDIUM",
      type: "INCIDENT",
      source: "MONITORING",
      monitoringStage: "INVESTIGATING",
    },
  });

  // Link ticket to alert
  await prisma.monitoringAlert.update({
    where: { id },
    data: { ticketId: ticket.id, stage: "INVESTIGATING" },
  });

  return NextResponse.json({ ticketId: ticket.id, ticketNumber: ticket.number }, { status: 201 });
}
