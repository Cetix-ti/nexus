// ============================================================================
// POST /api/v1/ai/tone-rewrite
//
// Reformule un texte selon une tonalité cible. Pas d'effet secondaire —
// retourne juste le texte transformé que l'UI affiche.
//
// Body : { text: string, tone: "brief"|"detailed"|"vulgarized"|"executive" }
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { rewriteWithTone, type Tone } from "@/lib/ai/features/tone-rewrite";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

const VALID_TONES: Tone[] = ["brief", "detailed", "vulgarized", "executive"];

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.manage");
  if (!__aiGuard.ok) return __aiGuard.res;
  // me reste accessible si besoin via __aiGuard.me
  const body = await req.json();
  const text = typeof body.text === "string" ? body.text : "";
  const toneRaw = body.tone as string;
  if (!text.trim() || text.length < 5) {
    return NextResponse.json(
      { error: "text requis (minimum 5 caractères)" },
      { status: 400 },
    );
  }
  if (!VALID_TONES.includes(toneRaw as Tone)) {
    return NextResponse.json(
      { error: `tone doit être l'un de ${VALID_TONES.join(" | ")}` },
      { status: 400 },
    );
  }

  const result = await rewriteWithTone({
    text: text.slice(0, 5000),
    tone: toneRaw as Tone,
  });
  if (!result) {
    return NextResponse.json({ error: "Reformulation impossible" }, { status: 502 });
  }
  return NextResponse.json({ result });
}
