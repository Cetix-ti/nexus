// ============================================================================
// POST /api/v1/intelligence/similar-learning/release
//
// Libère manuellement un token pénalisé — l'admin juge que la pénalité était
// un faux positif du learner (ex: mot technique légitime mal classé).
// Body : { token }
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

  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!body.token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  await prisma.aiPattern.deleteMany({
    where: {
      scope: "learned:similar",
      kind: "penalty_token",
      key: body.token,
    },
  });

  return NextResponse.json({ ok: true });
}
