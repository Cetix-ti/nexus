import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { notifyCommentAdded } from "@/lib/email/ticket-notifications";

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

  // Store both HTML and plain text versions
  const isHtml = rawContent.includes("<");
  const plainText = isHtml
    ? rawContent.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
    : rawContent;

  const comment = await prisma.comment.create({
    data: {
      ticketId: ticket.id,
      authorId: me.id,
      body: rawContent,
      bodyHtml: isHtml ? rawContent : null,
      isInternal: body.isInternal ?? false,
    },
    include: { author: { select: { firstName: true, lastName: true, avatar: true } } },
  });

  const authorName = comment.author
    ? `${comment.author.firstName} ${comment.author.lastName}`
    : me.email;

  notifyCommentAdded(ticket.id, {
    authorName,
    authorId: me.id,
    content: body.content.trim(),
    isInternal: body.isInternal ?? false,
  }).catch((err) => console.error("[comment notification]", err));

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
