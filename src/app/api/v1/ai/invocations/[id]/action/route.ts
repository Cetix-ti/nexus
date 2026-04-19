// ============================================================================
// POST /api/v1/ai/invocations/[id]/action
//
// Enregistre l'action humaine prise sur une suggestion IA — accepted,
// edited (avec le texte édité), ou rejected. Alimente la calibration
// continue (AiPattern.acceptance_rate par feature) et les métriques.
//
// Body : { action: "accepted" | "edited" | "rejected", edit?: string }
//
// N'a pas d'effet sur la donnée applicative (ex: n'applique PAS le
// changement de catégorie — c'est au caller de le faire via les endpoints
// PATCH standard du ticket). Rôle uniquement : tracer la décision humaine
// pour l'audit et l'amélioration des prompts.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { recordHumanAction } from "@/lib/ai/orchestrator";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  if (!["accepted", "edited", "rejected"].includes(action)) {
    return NextResponse.json(
      { error: "action doit être 'accepted' | 'edited' | 'rejected'" },
      { status: 400 },
    );
  }
  const edit =
    typeof body.edit === "string" && body.edit.trim()
      ? body.edit.slice(0, 8000)
      : undefined;

  await recordHumanAction({
    invocationId: id,
    action: action as "accepted" | "edited" | "rejected",
    edit,
  });
  return NextResponse.json({ ok: true });
}
