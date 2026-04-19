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

const VALID_TONES: Tone[] = ["brief", "detailed", "vulgarized", "executive"];

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
