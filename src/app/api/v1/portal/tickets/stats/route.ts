import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET() {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.canAccessPortal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgFilter: any = { organizationId: user.organizationId };

  // Standard users only see their own tickets
  if (!user.permissions.canSeeAllOrgTickets) {
    const contact = await prisma.contact.findFirst({
      where: { id: user.contactId },
      select: { email: true },
    });
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    orgFilter.requester = { email: contact.email };
  }

  // Count by status
  const byStatus = await prisma.ticket.groupBy({
    by: ["status"],
    where: orgFilter,
    _count: true,
  });

  // Count by priority
  const byPriority = await prisma.ticket.groupBy({
    by: ["priority"],
    where: orgFilter,
    _count: true,
  });

  // Total count
  const total = byStatus.reduce((s, r) => s + r._count, 0);

  // SLA breached count (active tickets only)
  const slaBreached = await prisma.ticket.count({
    where: {
      ...orgFilter,
      slaBreached: true,
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
  });

  // Overdue count
  const overdue = await prisma.ticket.count({
    where: {
      ...orgFilter,
      isOverdue: true,
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
  });

  return NextResponse.json({
    total,
    byStatus: byStatus.map((r) => ({
      status: r.status.toLowerCase(),
      count: r._count,
    })),
    byPriority: byPriority.map((r) => ({
      priority: r.priority.toLowerCase(),
      count: r._count,
    })),
    slaBreached,
    overdue,
  });
}
