// ============================================================================
// POST /api/v1/intelligence/category-learning/release
//
// Libère manuellement une avoidance token×catégorie. Body : { key }
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { key?: string };
  if (!body.key) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }

  await prisma.aiPattern.deleteMany({
    where: {
      scope: "learned:category_suggest",
      kind: "avoid_token_for_category",
      key: body.key,
    },
  });

  return NextResponse.json({ ok: true });
}
