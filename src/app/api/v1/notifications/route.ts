import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * GET /api/v1/notifications
 * Returns recent notifications for the current user:
 * - Tickets assigned to them
 * - SLA breaches on their tickets
 * - Comments on their tickets
 * - Approval requests
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const limit = Number(sp.get("limit")) || 20;
  const since = sp.get("since")
    ? new Date(sp.get("since")!)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default: last 7 days

  // Fetch recent activities on tickets assigned to or created by this user
  const [assignedActivities, recentComments, slaBreaches, approvalRequests] = await Promise.all([
    // Activities on tickets assigned to me
    prisma.activity.findMany({
      where: {
        createdAt: { gte: since },
        ticket: { assigneeId: me.id },
        userId: { not: me.id }, // Don't notify about own actions
      },
      include: {
        ticket: { select: { id: true, number: true, subject: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),

    // Comments on tickets I'm assigned to (by others)
    prisma.comment.findMany({
      where: {
        createdAt: { gte: since },
        ticket: { assigneeId: me.id },
        authorId: { not: me.id },
      },
      include: {
        ticket: { select: { id: true, number: true, subject: true } },
        author: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),

    // SLA breaches on my tickets
    prisma.ticket.findMany({
      where: {
        assigneeId: me.id,
        slaBreached: true,
        status: { in: ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "PENDING", "WAITING_CLIENT", "WAITING_VENDOR"] },
      },
      select: { id: true, number: true, subject: true, priority: true, dueAt: true },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),

    // Tickets awaiting my approval (if I'm also a portal approver)
    prisma.ticketApproval.findMany({
      where: {
        status: "PENDING",
        approverEmail: { equals: me.email, mode: "insensitive" },
      },
      include: {
        ticket: { select: { id: true, number: true, subject: true } },
      },
      take: 10,
    }),
  ]);

  // Build unified notification list
  const notifications: any[] = [];

  for (const a of assignedActivities) {
    notifications.push({
      id: `act_${a.id}`,
      type: "activity",
      title: `${a.user?.firstName ?? "Quelqu'un"} ${a.user?.lastName ?? ""} — ${a.action}`,
      description: a.ticket ? `#${a.ticket.number} ${a.ticket.subject}` : "",
      ticketId: a.ticket?.id,
      ticketNumber: a.ticket?.number,
      createdAt: a.createdAt.toISOString(),
      read: false,
    });
  }

  for (const c of recentComments) {
    notifications.push({
      id: `com_${c.id}`,
      type: "comment",
      title: `${c.author?.firstName ?? ""} ${c.author?.lastName ?? ""} a commenté`,
      description: c.ticket ? `#${c.ticket.number} ${c.ticket.subject}` : "",
      ticketId: c.ticket?.id,
      ticketNumber: c.ticket?.number,
      createdAt: c.createdAt.toISOString(),
      read: false,
    });
  }

  for (const t of slaBreaches) {
    notifications.push({
      id: `sla_${t.id}`,
      type: "sla_breach",
      title: `SLA dépassé — ${t.priority}`,
      description: `#${t.number} ${t.subject}`,
      ticketId: t.id,
      ticketNumber: t.number,
      createdAt: t.dueAt?.toISOString() ?? new Date().toISOString(),
      read: false,
    });
  }

  for (const a of approvalRequests) {
    notifications.push({
      id: `apr_${a.id}`,
      type: "approval",
      title: "Approbation requise",
      description: a.ticket ? `#${a.ticket.number} ${a.ticket.subject}` : "",
      ticketId: a.ticket?.id,
      ticketNumber: a.ticket?.number,
      createdAt: a.createdAt.toISOString(),
      read: false,
    });
  }

  // Sort by date descending
  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    success: true,
    data: notifications.slice(0, limit),
    meta: { total: notifications.length },
  });
}
