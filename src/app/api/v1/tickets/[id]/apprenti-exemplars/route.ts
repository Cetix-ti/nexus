// ============================================================================
// GET /api/v1/tickets/[id]/apprenti-exemplars
//
// Pour un ticket donné : si l'assigné a < JUNIOR_THRESHOLD tickets résolus
// dans la catégorie, retourne les tickets exemplaires correspondants pour
// servir de guide. Sinon, rien à afficher (pas de valeur pour un senior).
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getApprenticeExemplarsForTicket } from "@/lib/ai/jobs/tech-apprenti";

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
  const result = await getApprenticeExemplarsForTicket(id);
  if (!result) return NextResponse.json({ shouldShow: false, exemplars: [] });
  return NextResponse.json(result);
}
