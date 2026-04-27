import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { chatCompletion, buildSystemPrompt, saveMemory, ragSearch, deleteMemory } from "@/lib/ai/service";
import { createAnonymizer, anonymizeText, deanonymize, seedFromDatabase } from "@/lib/ai/anonymizer";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  try {
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

    // Anonymize PII before sending to external AI API (opt-out via AI_ANONYMIZE=false)
    const shouldAnonymize = process.env.AI_ANONYMIZE !== "false";
    let anonMap: Awaited<ReturnType<typeof createAnonymizer>> | null = null;

    if (shouldAnonymize) {
      anonMap = createAnonymizer();
      // Pre-seed with all known entities from the DB so every name/email in the prompt gets caught
      await seedFromDatabase(anonMap);
    }

    const messages = [
      { role: "system" as const, content: anonMap ? anonymizeText(anonMap, fullSystemPrompt) : fullSystemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: anonMap ? anonymizeText(anonMap, m.content) : m.content,
      })),
    ];

    // Call AI (with anonymized data if enabled)
    const rawReply = await chatCompletion(messages);

    // De-anonymize the AI response back to real values
    const reply = anonMap ? deanonymize(anonMap, rawReply) : rawReply;

    // Detect and process memory commands in the reply
    let cleanReply = reply;
    const memorySaveMatch = reply.match(/\[MEMORY_SAVE:([^:\]]+):(.+?)\]/g);
    if (memorySaveMatch) {
      for (const match of memorySaveMatch) {
        const parts = match.match(/\[MEMORY_SAVE:([^:\]]+):(.+?)\]/);
        if (parts) {
          await saveMemory(parts[2], parts[1], "global", `agent:${me.id}`);
        }
        cleanReply = cleanReply.replace(match, "").trim();
      }
      if (cleanReply) cleanReply += "\n\n✅ Mémorisé.";
      else cleanReply = "✅ Mémorisé.";
    }

    // Handle MEMORY_DELETE commands
    const memoryDeleteMatch = cleanReply.match(/\[MEMORY_DELETE:(.+?)\]/g);
    if (memoryDeleteMatch) {
      for (const match of memoryDeleteMatch) {
        const parts = match.match(/\[MEMORY_DELETE:(.+?)\]/);
        if (parts) {
          const contentToDelete = parts[1].trim();
          const memories = await prisma.aiMemory.findMany({
            where: {
              OR: [
                { content: { contains: contentToDelete, mode: "insensitive" } },
              ],
            },
          });
          for (const mem of memories) {
            await deleteMemory(mem.id);
          }
        }
        cleanReply = cleanReply.replace(match, "").trim();
      }
      if (cleanReply) cleanReply += "\n\n🗑️ Mémoire supprimée.";
      else cleanReply = "🗑️ Mémoire supprimée.";
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
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  try {
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
