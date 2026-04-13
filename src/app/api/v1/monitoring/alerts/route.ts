import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const days = Number(searchParams.get("days")) || 7;
    const stage = searchParams.get("stage");
    const sourceType = searchParams.get("sourceType");
    const orgId = searchParams.get("organizationId");
    const resolved = searchParams.get("resolved");

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = { receivedAt: { gte: since } };
    if (stage) where.stage = stage;
    if (sourceType) where.sourceType = sourceType;
    if (orgId) where.organizationId = orgId;
    if (resolved === "true") where.isResolved = true;
    if (resolved === "false") where.isResolved = false;

    // Fetch real monitoring alerts
    const [alerts, stageStats, sourceStats] = await Promise.all([
      prisma.monitoringAlert.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        take: 500,
      }),
      prisma.monitoringAlert.groupBy({
        by: ["stage"],
        where: { receivedAt: { gte: since } },
        _count: true,
      }),
      prisma.monitoringAlert.groupBy({
        by: ["sourceType"],
        where: { receivedAt: { gte: since } },
        _count: true,
      }),
    ]);

    // Also fetch tickets of type ALERT or source MONITORING
    // (tickets tagged as monitoring via type=ALERT or containing "Atera"/"Zabbix")
    const ticketWhere: any = {
      OR: [
        { type: "ALERT" },
        { source: "MONITORING" },
        { monitoringStage: { not: null } },
      ],
    };
    if (stage) ticketWhere.monitoringStage = stage;
    if (orgId) ticketWhere.organizationId = orgId;

    const monitoringTickets = await prisma.ticket.findMany({
      where: ticketWhere,
      include: {
        organization: { select: { name: true } },
        assignee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Map tickets to alert-like shape for the frontend
    const ticketAlerts = monitoringTickets.map((t) => ({
      id: `ticket_${t.id}`,
      ticketId: t.id,
      organizationId: t.organizationId,
      organizationName: t.organization?.name ?? null,
      sourceType: "atera", // default for ticket-sourced alerts
      severity: t.priority === "CRITICAL" ? "CRITICAL" : t.priority === "HIGH" ? "HIGH" : "WARNING",
      stage: t.monitoringStage ?? "TRIAGE",
      subject: t.subject,
      body: t.description.slice(0, 500),
      senderEmail: "",
      senderDomain: "",
      receivedAt: t.createdAt.toISOString(),
      isResolved: ["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status),
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      notes: t.monitoringNotes,
      alertGroupKey: null,
      isTicket: true,
      ticketNumber: t.number,
      ticketStatus: t.status,
      assigneeName: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : null,
    }));

    // Merge: put real alerts first, then ticket-sourced alerts (dedup by ticketId)
    const existingTicketIds = new Set(alerts.filter((a) => a.ticketId).map((a) => a.ticketId));
    const uniqueTicketAlerts = ticketAlerts.filter((ta) => !existingTicketIds.has(ta.ticketId));

    const merged = [...alerts, ...uniqueTicketAlerts];

    return NextResponse.json({
      alerts: merged,
      stageStats: stageStats.map((r) => ({
        stage: r.stage,
        count: typeof r._count === "number" ? r._count : (r._count as any)?._all ?? 0,
      })),
      sourceStats: sourceStats.map((r) => ({
        sourceType: r.sourceType,
        count: typeof r._count === "number" ? r._count : (r._count as any)?._all ?? 0,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
