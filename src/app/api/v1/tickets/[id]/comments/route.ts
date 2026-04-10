import { NextRequest, NextResponse } from "next/server";
import { tickets, comments } from "../../../_lib/mock-data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ticket = tickets.find((t) => t.id === id || t.number.toString() === id);

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found" },
        { status: 404 }
      );
    }

    const ticketComments = comments
      .filter((c) => c.ticketId === ticket.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return NextResponse.json({
      success: true,
      data: ticketComments,
      meta: { total: ticketComments.length },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ticket = tickets.find((t) => t.id === id || t.number.toString() === id);

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Comment content is required" },
        { status: 400 }
      );
    }

    const newComment = {
      id: `cmt_${Date.now()}`,
      ticketId: ticket.id,
      authorId: body.authorId || "usr_01",
      authorName: body.authorName || "Jean-Philippe Martin",
      content: body.content.trim(),
      isInternal: body.isInternal ?? false,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(
      { success: true, data: newComment },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
