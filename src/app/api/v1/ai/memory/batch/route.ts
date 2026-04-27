// ============================================================================
// POST /api/v1/ai/memory/batch
//
// Valider ou rejeter plusieurs faits AiMemory d'un coup. Utilisé par la vue
// "Faits en attente (global)" après un bulk-extract-facts : sans batch, un
// admin avec 50+ faits à valider clique 50 fois — friction qui décourage la
// revue et laisse les faits inutilisables.
//
// Body : { ids: string[], action: "verify" | "reject" }
// Limite : 200 ids par appel (évite un updateMany énorme et protège la DB).
//
// Réservé SUPERVISOR+ (même règle que l'endpoint single-fact).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const action = body.action as string;

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "ids doit contenir au moins un identifiant" },
      { status: 400 },
    );
  }
  if (ids.length > 200) {
    return NextResponse.json(
      { error: "Max 200 ids par batch" },
      { status: 400 },
    );
  }
  if (action !== "verify" && action !== "reject") {
    return NextResponse.json(
      { error: "action doit être 'verify' ou 'reject'" },
      { status: 400 },
    );
  }

  const data =
    action === "verify"
      ? {
          verifiedAt: new Date(),
          verifiedBy: me.id,
          rejectedAt: null,
          rejectedBy: null,
        }
      : {
          rejectedAt: new Date(),
          rejectedBy: me.id,
          verifiedAt: null,
          verifiedBy: null,
        };

  const result = await prisma.aiMemory.updateMany({
    where: { id: { in: ids } },
    data,
  });

  return NextResponse.json({
    action,
    requested: ids.length,
    updated: result.count,
  });
}
