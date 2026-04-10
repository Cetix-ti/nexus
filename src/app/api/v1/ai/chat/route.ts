import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { chatCompletion, buildSystemPrompt } from "@/lib/ai/service";

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { message, conversationId } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "Message requis" }, { status: 422 });
    }

    // Get or create conversation
    let convoId = conversationId;
    if (!convoId) {
      const convo = await prisma.aiConversation.create({
        data: {
          userId: me.id,
          title: message.slice(0, 80),
        },
      });
      convoId = convo.id;
    }

    // Save user message
    await prisma.aiMessage.create({
      data: { conversationId: convoId, role: "user", content: message },
    });

    // Build context-aware prompt
    const systemPrompt = await buildSystemPrompt();

    // Get conversation history (last 20 messages for context)
    const history = await prisma.aiMessage.findMany({
      where: { conversationId: convoId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Call AI
    const reply = await chatCompletion(messages);

    // Save assistant reply
    await prisma.aiMessage.create({
      data: { conversationId: convoId, role: "assistant", content: reply },
    });

    return NextResponse.json({
      conversationId: convoId,
      reply,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur IA" },
      { status: 500 },
    );
  }
}

/** GET — load conversation history */
export async function GET(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const convoId = searchParams.get("conversationId");

    if (convoId) {
      const messages = await prisma.aiMessage.findMany({
        where: { conversationId: convoId },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ conversationId: convoId, messages });
    }

    // List recent conversations
    const conversations = await prisma.aiConversation.findMany({
      where: { userId: me.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({ conversations });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
