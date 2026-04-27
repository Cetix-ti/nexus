import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { listMemories, saveMemory, deleteMemory } from "@/lib/ai/service";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET(req: Request) {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || undefined; // "global" or userId

    const memories = await listMemories(scope);
    return NextResponse.json(memories);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  try {
    const { content, category, scope } = await req.json();
    if (!content) return NextResponse.json({ error: "content required" }, { status: 422 });

    await saveMemory(
      content,
      category || "note",
      scope || "global",
      `agent:${me.id}`,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 422 });

    await deleteMemory(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
