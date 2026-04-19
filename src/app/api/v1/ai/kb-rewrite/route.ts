// ============================================================================
// POST /api/v1/ai/kb-rewrite
//
// Reformule un article KB selon un focus (professional / concise / structured
// / beginner). Retourne la nouvelle version SANS muter la DB — l'UI décide
// si elle applique ou non.
//
// Body : { title, body (HTML), summary?, focus }
// Retour : { newTitle, newSummary, newBody, changes[] }
//
// Réservé TECHNICIAN+ (rédaction KB = rôle standard).
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import {
  rewriteArticle,
  type RewriteFocus,
} from "@/lib/ai/features/kb-rewrite";

const VALID_FOCUS: RewriteFocus[] = [
  "professional",
  "concise",
  "structured",
  "beginner",
];

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "TECHNICIAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : "";
  const articleBody = typeof body.body === "string" ? body.body : "";
  const summary = typeof body.summary === "string" ? body.summary : "";
  const focus = (
    VALID_FOCUS.includes(body.focus) ? body.focus : "professional"
  ) as RewriteFocus;

  if (!title.trim() || !articleBody.trim()) {
    return NextResponse.json(
      { error: "title et body requis (min 1 caractère chacun)" },
      { status: 400 },
    );
  }
  // Cap à 50 000 caractères en entrée pour éviter un prompt explosé.
  if (articleBody.length > 50_000) {
    return NextResponse.json(
      { error: "Article trop long (max 50 000 caractères)" },
      { status: 413 },
    );
  }

  const result = await rewriteArticle({ title, body: articleBody, summary, focus });
  if (!result) {
    return NextResponse.json(
      { error: "L'IA n'a pas pu reformuler — réessaye dans un instant." },
      { status: 502 },
    );
  }
  return NextResponse.json(result);
}
