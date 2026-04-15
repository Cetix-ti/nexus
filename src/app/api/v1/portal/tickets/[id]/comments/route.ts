import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { notifyCommentAdded } from "@/lib/email/ticket-notifications";

export async function POST(
  request: NextRequest,
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

  // Find ticket scoped to this organization
  const ticket = await prisma.ticket.findFirst({
    where: {
      OR: [{ id }, { number: parseInt(id) || -1 }],
      organizationId: user.organizationId,
    },
    include: {
      requester: { select: { email: true } },
    },
  });

  if (!ticket) {
    return NextResponse.json(
      { success: false, error: "Billet introuvable" },
      { status: 404 },
    );
  }

  // Standard portal users can only comment on their own tickets
  if (!user.permissions.canSeeAllOrgTickets) {
    if (ticket.requester?.email?.toLowerCase() !== user.email) {
      return NextResponse.json(
        { success: false, error: "Accès refusé" },
        { status: 403 },
      );
    }
  }

  const body = await request.json();
  if (!body.content?.trim()) {
    return NextResponse.json(
      { success: false, error: "Le contenu est requis" },
      { status: 400 },
    );
  }

  // Comment.authorId references User, but portal users are Contacts.
  // Find or create a lightweight SHADOW User record for this portal contact.
  // CRITICAL: shadow users must be isActive=false so getCurrentUser() blocks
  // them — they cannot authenticate as agents. They also have no password.
  let authorUser = await prisma.user.findUnique({
    where: { email: user.email },
  });

  if (!authorUser) {
    authorUser = await prisma.user.create({
      data: {
        email: user.email,
        firstName: user.name.split(" ")[0] || "Utilisateur",
        lastName: user.name.split(" ").slice(1).join(" ") || "",
        role: "CLIENT_USER",
        isActive: false, // shadow — cannot authenticate as agent
        externalSource: "portal_shadow",
      },
    });
  }

  const rawContent = body.content.trim();
  const isHtml = rawContent.includes("<");
  // HTML sanitization + plain text fallback identique au pipeline agent.
  const { sanitizeEmailHtml, plainTextToHtml, htmlToPlainText } = await import("@/lib/email-to-ticket/html");
  const bodyHtml = isHtml ? sanitizeEmailHtml(rawContent) : plainTextToHtml(rawContent);
  const bodyText = isHtml ? htmlToPlainText(bodyHtml) : rawContent;

  const comment = await prisma.comment.create({
    data: {
      ticketId: ticket.id,
      authorId: authorUser.id,
      body: bodyText,
      bodyHtml,
      isInternal: false, // Portal users can never create internal notes
      source: "portal",
    },
    include: {
      author: {
        select: { firstName: true, lastName: true, avatar: true },
      },
    },
  });

  // Re-ouvre le ticket s'il était RESOLVED/CLOSED — le client vient de
  // répondre, il veut une réponse.
  await prisma.ticket.updateMany({
    where: { id: ticket.id, status: { in: ["RESOLVED", "CLOSED"] } },
    data: { status: "OPEN", resolvedAt: null, closedAt: null },
  });

  notifyCommentAdded(ticket.id, {
    authorName: `${comment.author.firstName} ${comment.author.lastName}`,
    authorId: comment.authorId,
    content: body.content.trim(),
    isInternal: false,
  }).catch((err) => console.error("[portal comment notification]", err));

  // Update ticket updatedAt timestamp
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        id: comment.id,
        ticketId: comment.ticketId,
        authorName: `${comment.author.firstName} ${comment.author.lastName}`,
        authorAvatar: comment.author.avatar ?? null,
        content: comment.body,
        isInternal: false,
        createdAt: comment.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
