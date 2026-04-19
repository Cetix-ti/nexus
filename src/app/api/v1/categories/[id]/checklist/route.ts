// ============================================================================
// GET/POST /api/v1/categories/[id]/checklist
//
// GET  : renvoie la checklist cachée (AiPattern) pour cette catégorie.
//        Null si pas encore générée ou expirée.
// POST : force la régénération (scanne les tickets résolus de la catégorie
//        et appelle l'IA). Réservé aux rôles TECHNICIAN+.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import {
  getChecklistForCategory,
  generateChecklistForCategory,
} from "@/lib/ai/features/checklists";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const checklist = await getChecklistForCategory(id);
  return NextResponse.json({ checklist });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const checklist = await generateChecklistForCategory(id);
  if (!checklist) {
    return NextResponse.json(
      {
        error:
          "Impossible de générer une checklist — pas assez de tickets résolus pour cette catégorie (minimum 3).",
      },
      { status: 422 },
    );
  }
  return NextResponse.json({ checklist });
}
