import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { listTickets, createTicket } from "@/lib/tickets/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tickets = await listTickets({
    organizationId: url.searchParams.get("organizationId") || undefined,
    status: url.searchParams.get("status") || undefined,
    search: url.searchParams.get("q") || url.searchParams.get("search") || undefined,
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
      organizationId = firstOrg?.id ?? "unknown";
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
    if (!assigneeId && body.assigneeName) {
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

    const creatorId = me?.id ?? body.creatorId;
    if (!creatorId) {
      // Fallback to first admin
      const admin = await prisma.user.findFirst({
        where: { role: { in: ["SUPER_ADMIN", "MSP_ADMIN"] }, isActive: true },
        select: { id: true },
      });
      if (!admin) return NextResponse.json({ error: "Aucun agent trouvé" }, { status: 500 });
    }

    // Resolve category by name
    let categoryId = body.categoryId ?? null;
    if (!categoryId && body.category) {
      const cat = await prisma.category.findFirst({
        where: { name: { equals: body.category, mode: "insensitive" } },
        select: { id: true },
      });
      if (cat) categoryId = cat.id;
    }

    // Resolve queue by name
    let queueId = body.queueId ?? null;
    if (!queueId && body.queue) {
      const q = await prisma.queue.findFirst({
        where: { name: { equals: body.queue, mode: "insensitive" } },
        select: { id: true },
      });
      if (q) queueId = q.id;
    }

    const finalCreatorId = creatorId ?? (await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;
    if (!finalCreatorId) {
      return NextResponse.json({ error: "Aucun agent trouvé" }, { status: 500 });
    }

    const created = await createTicket({
      subject: body.subject,
      description: body.description ?? "",
      organizationId,
      requesterId,
      assigneeId,
      creatorId: finalCreatorId,
      type: body.type?.toUpperCase() ?? "INCIDENT",
      priority: body.priority?.toUpperCase() ?? "MEDIUM",
      categoryId,
      queueId,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de création" },
      { status: 500 },
    );
  }
}
