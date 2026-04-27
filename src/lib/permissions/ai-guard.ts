// ============================================================================
// AI permission guard — réutilisable dans toutes les routes API IA.
//
// Usage typique :
//   const guard = await requireAiPermission("ai.view");
//   if (!guard.ok) return guard.res;
//   const me = guard.me;
//   // ... reste de la handler
//
// Mapping recommandé :
//   - GET / consultation                    → ai.view
//   - POST analyse / prédiction / déclencher → ai.run_jobs
//   - POST/PATCH config / seuils / modèles  → ai.manage
//   - GET /costs, /tokens, /usage           → ai.view_costs
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, hasCapability, type AuthUser } from "@/lib/auth-utils";

export type AiPermission = "ai.view" | "ai.manage" | "ai.run_jobs" | "ai.view_costs";

export type AiGuardResult =
  | { ok: true; me: AuthUser }
  | { ok: false; res: NextResponse };

export async function requireAiPermission(perm: AiPermission): Promise<AiGuardResult> {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  // Bloquer les rôles client par principe — l'IA est interne.
  if (me.role.startsWith("CLIENT_")) {
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!hasCapability(me, perm)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: `Forbidden — permission requise: ${perm}` },
        { status: 403 },
      ),
    };
  }
  return { ok: true, me };
}
