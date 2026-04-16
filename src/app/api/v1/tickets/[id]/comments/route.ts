import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { notifyCommentAdded } from "@/lib/email/ticket-notifications";
import { sendTicketReplyEmail } from "@/lib/email/ticket-reply";
import { htmlToPlainText } from "@/lib/email-to-ticket/html";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const ticket = await prisma.ticket.findFirst({
    where: { OR: [{ id }, { number: parseInt(id) || -1 }] },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
  }

  const comments = await prisma.comment.findMany({
    where: { ticketId: ticket.id },
    include: { author: { select: { firstName: true, lastName: true, avatar: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    success: true,
    data: comments.map((c) => ({
      id: c.id,
      ticketId: c.ticketId,
      authorId: c.authorId,
      authorName: c.author ? `${c.author.firstName} ${c.author.lastName}` : "Système",
      authorAvatar: c.author?.avatar ?? null,
      content: c.body,
      contentHtml: c.bodyHtml,
      source: c.source,
      isInternal: c.isInternal,
      createdAt: c.createdAt.toISOString(),
    })),
    meta: { total: comments.length },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ticket = await prisma.ticket.findFirst({
    where: { OR: [{ id }, { number: parseInt(id) || -1 }] },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
  }

  const body = await request.json();
  const rawContent = body.content?.trim();
  if (!rawContent) {
    return NextResponse.json({ success: false, error: "Content required" }, { status: 400 });
  }

  // On stocke TOUJOURS bodyHtml (permet l'affichage fidèle au portail /
  // fiche ticket) + un plain extrait depuis le HTML pour la recherche.
  const isHtml = rawContent.includes("<");
  const bodyHtml = isHtml ? rawContent : null;
  const plainText = isHtml ? htmlToPlainText(rawContent) : rawContent;

  const comment = await prisma.comment.create({
    data: {
      ticketId: ticket.id,
      authorId: me.id,
      body: plainText,
      bodyHtml,
      isInternal: body.isInternal ?? false,
      source: "agent",
    },
    include: { author: { select: { firstName: true, lastName: true, avatar: true } } },
  });

  const authorName = comment.author
    ? `${comment.author.firstName} ${comment.author.lastName}`
    : me.email;

  // Commentaire public → envoi par courriel au demandeur (threading MIME
  // correct). Note interne → reste strictement interne (jamais envoyée).
  if (!comment.isInternal) {
    sendTicketReplyEmail(comment.id).catch((err) =>
      console.error("[ticket-reply email]", err),
    );
  }

  // Garde le legacy notifyCommentAdded pour les canaux internes (agent
  // assigné notifié d'une note interne, etc.) — sendTicketReplyEmail est
  // dédié au pipeline client omnicanal.
  notifyCommentAdded(ticket.id, {
    authorName,
    authorId: me.id,
    content: plainText,
    isInternal: body.isInternal ?? false,
  }).catch((err) => console.error("[comment notification]", err));

  // Notification in-app + email aux watchers + mentions via dispatcher
  // central qui respecte les préférences. Les @mentions sont extraites
  // naïvement du bodyHtml (format @{userId} ou @prénom nom recherché par
  // l'UI). Pour l'instant on prend les mentions fournies par le client si
  // disponibles (body.mentionedUserIds).
  const mentionedUserIds = Array.isArray(body.mentionedUserIds)
    ? body.mentionedUserIds.filter((x: unknown): x is string => typeof x === "string")
    : [];
  import("@/lib/notifications/dispatch")
    .then((m) =>
      m.dispatchTicketComment({
        ticketId: ticket.id,
        authorUserId: me.id,
        commentBody: plainText,
        isInternal: body.isInternal ?? false,
        mentionedUserIds,
      }),
    )
    .catch(() => {});

  return NextResponse.json({
    success: true,
    data: {
      id: comment.id,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      authorName: comment.author ? `${comment.author.firstName} ${comment.author.lastName}` : me.email,
      authorAvatar: comment.author?.avatar ?? null,
      content: comment.body,
      isInternal: comment.isInternal,
      createdAt: comment.createdAt.toISOString(),
    },
  }, { status: 201 });
}
