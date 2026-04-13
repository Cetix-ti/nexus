import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!user.permissions.canAccessPortal) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;

  // Find ticket by id or number, scoped to the portal user's organization
  const ticket = await prisma.ticket.findFirst({
    where: {
      OR: [{ id }, { number: parseInt(id) || -1 }],
      organizationId: user.organizationId,
    },
    include: {
      organization: { select: { name: true } },
      requester: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      assignee: {
        select: { firstName: true, lastName: true, avatar: true },
      },
      category: { select: { name: true } },
      queue: { select: { name: true } },
      comments: {
        where: { isInternal: false },
        include: {
          author: {
            select: { firstName: true, lastName: true, avatar: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json(
      { success: false, error: "Billet introuvable" },
      { status: 404 },
    );
  }

  // Standard portal users can only see their own tickets
  if (!user.permissions.canSeeAllOrgTickets) {
    if (ticket.requester?.email?.toLowerCase() !== user.email) {
      return NextResponse.json(
        { success: false, error: "Accès refusé" },
        { status: 403 },
      );
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      id: ticket.id,
      number: ticket.number,
      displayNumber: `INC-${1000 + ticket.number}`,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      organizationName: ticket.organization?.name ?? "—",
      requesterName: ticket.requester
        ? `${ticket.requester.firstName} ${ticket.requester.lastName}`
        : "—",
      requesterEmail: ticket.requester?.email ?? "",
      assigneeName: ticket.assignee
        ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
        : null,
      assigneeAvatar: ticket.assignee?.avatar ?? null,
      categoryName: ticket.category?.name ?? "—",
      queueName: ticket.queue?.name ?? "—",
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      dueAt: ticket.dueAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      comments: ticket.comments.map((c) => ({
        id: c.id,
        authorName: c.author
          ? `${c.author.firstName} ${c.author.lastName}`
          : "Système",
        authorAvatar: c.author?.avatar ?? null,
        content: c.body,
        isInternal: false,
        createdAt: c.createdAt.toISOString(),
      })),
    },
  });
}
