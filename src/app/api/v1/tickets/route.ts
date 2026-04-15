import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { listTickets, createTicket, typeToDb } from "@/lib/tickets/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Resolve assignee=me to current user's ID
  let assigneeId = url.searchParams.get("assigneeId") || undefined;
  const assigneeParam = url.searchParams.get("assignee");
  if (assigneeParam === "me") {
    const me = await getCurrentUser();
    if (me) assigneeId = me.id;
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  const tickets = await listTickets({
    organizationId: url.searchParams.get("organizationId") || undefined,
    status: url.searchParams.get("status") || undefined,
    search: url.searchParams.get("q") || url.searchParams.get("search") || undefined,
    assigneeId,
    projectId: url.searchParams.get("projectId") || undefined,
    limit,
    // includeMonitoring=true pour que le dashboard "Alertes monitoring"
    // puisse les récupérer. Par défaut exclus des vues tickets classiques.
    includeMonitoring: url.searchParams.get("includeMonitoring") === "true",
    // internal=true → seulement internes (admin Cetix) ; "all" → tout.
    internal:
      url.searchParams.get("internal") === "true"
        ? true
        : url.searchParams.get("internal") === "all"
        ? "all"
        : false,
  });
  return NextResponse.json(tickets);
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    const body = await req.json();

    if (!body.subject) {
      return NextResponse.json({ error: "Le sujet est requis" }, { status: 400 });
    }

    // Resolve organization by name if ID not provided
    let organizationId = body.organizationId;
    if (!organizationId && body.organizationName) {
      const org = await prisma.organization.findFirst({
        where: { name: { equals: body.organizationName, mode: "insensitive" } },
        select: { id: true },
      });
      if (org) organizationId = org.id;
    }
    if (!organizationId) {
      // Use first active org as fallback
      const firstOrg = await prisma.organization.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      organizationId = firstOrg?.id;
    }
    if (!organizationId) {
      return NextResponse.json({ error: "Organisation non trouvée" }, { status: 400 });
    }

    // Resolve requester by name if provided
    let requesterId = body.requesterId;
    if (!requesterId && body.requesterName && organizationId) {
      const parts = body.requesterName.split(" ");
      const contact = await prisma.contact.findFirst({
        where: {
          organizationId,
          OR: [
            { firstName: { contains: parts[0] ?? "", mode: "insensitive" } },
            { email: { contains: body.requesterName, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (contact) requesterId = contact.id;
    }

    // Resolve assignee by name if provided
    let assigneeId = body.assigneeId;
    if (!assigneeId && body.assigneeName && body.assigneeName !== "unassigned") {
      const parts = body.assigneeName.split(" ");
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { firstName: { contains: parts[0] ?? "", mode: "insensitive" } },
            { lastName: { contains: parts[parts.length - 1] ?? "", mode: "insensitive" } },
          ],
          isActive: true,
        },
        select: { id: true },
      });
      if (user) assigneeId = user.id;
    }

    // Resolve creator — current user, then body, then first admin
    let creatorId = me?.id ?? body.creatorId;
    if (!creatorId) {
      const admin = await prisma.user.findFirst({
        where: { role: { in: ["SUPER_ADMIN", "MSP_ADMIN"] }, isActive: true },
        select: { id: true },
      });
      creatorId = admin?.id;
    }
    if (!creatorId) {
      const anyUser = await prisma.user.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      creatorId = anyUser?.id;
    }
    if (!creatorId) {
      return NextResponse.json({ error: "Aucun agent trouvé" }, { status: 500 });
    }

    // Resolve category by name (accept both `category` and `categoryName`)
    let categoryId = body.categoryId ?? null;
    const categoryName = body.category || body.categoryName;
    if (!categoryId && categoryName) {
      const cat = await prisma.category.findFirst({
        where: { name: { equals: categoryName, mode: "insensitive" } },
        select: { id: true },
      });
      if (cat) categoryId = cat.id;
    }

    // Resolve queue by name (accept both `queue` and `queueName`)
    let queueId = body.queueId ?? null;
    const queueName = body.queue || body.queueName;
    if (!queueId && queueName) {
      const q = await prisma.queue.findFirst({
        where: { name: { equals: queueName, mode: "insensitive" } },
        select: { id: true },
      });
      if (q) queueId = q.id;
    }

    const created = await createTicket({
      subject: body.subject,
      description: body.description ?? "",
      organizationId,
      requesterId,
      assigneeId,
      creatorId,
      type: body.type ?? "incident",
      priority: body.priority ?? "medium",
      urgency: body.urgency,
      impact: body.impact,
      source: body.source,
      categoryId,
      queueId,
    });

    // Handle approval workflow if requested
    if (body.requireApproval && Array.isArray(body.approvers) && body.approvers.length > 0) {
      const approvalData = body.approvers.map((a: any, i: number) => ({
        ticketId: created.id,
        approverId: a.contactId || a.id || "",
        approverName: a.name || a.contactName || "",
        approverEmail: a.email || a.contactEmail || "",
        role: i === 0 ? "primary" : "secondary",
      }));

      await prisma.$transaction([
        prisma.ticketApproval.createMany({ data: approvalData }),
        prisma.ticket.update({
          where: { id: created.id },
          data: {
            requiresApproval: true,
            approvalStatus: "PENDING",
          },
        }),
      ]);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de création" },
      { status: 500 },
    );
  }
}
