import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { chatCompletion, buildSystemPrompt, saveMemory, ragSearch } from "@/lib/ai/service";

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

    // Build context-aware prompt with user's memories
    const [systemPrompt, ragResults] = await Promise.all([
      buildSystemPrompt(me.id),
      ragSearch(message),
    ]);

    // Get conversation history (last 20 messages for context)
    const history = await prisma.aiMessage.findMany({
      where: { conversationId: convoId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // Inject RAG results into the system prompt
    const fullSystemPrompt = ragResults
      ? `${systemPrompt}\n${ragResults}`
      : systemPrompt;

    const messages = [
      { role: "system" as const, content: fullSystemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Call AI
    const reply = await chatCompletion(messages);

    // Detect and process memory commands in the reply
    let cleanReply = reply;
    const memorySaveMatch = reply.match(/\[MEMORY_SAVE:(\w+):(.+?)\]/g);
    if (memorySaveMatch) {
      for (const match of memorySaveMatch) {
        const parts = match.match(/\[MEMORY_SAVE:(\w+):(.+?)\]/);
        if (parts) {
          await saveMemory(parts[2], parts[1], "global", `agent:${me.id}`);
        }
        cleanReply = cleanReply.replace(match, "").trim();
      }
      if (cleanReply) cleanReply += "\n\n✅ Mémorisé.";
      else cleanReply = "✅ Mémorisé.";
    }

    // Save assistant reply
    await prisma.aiMessage.create({
      data: { conversationId: convoId, role: "assistant", content: cleanReply },
    });

    return NextResponse.json({
      conversationId: convoId,
      reply: cleanReply,
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
