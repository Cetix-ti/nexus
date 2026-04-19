// ============================================================================
// GET /api/v1/tickets/[id]/suggest-assignee
//
// Retourne jusqu'à 5 techniciens optimaux pour ce ticket, classés par score
// composite (expertise catégorie × disponibilité actuelle). Consommé par
// un widget "Suggestions d'assignation" ou appelé à l'ouverture d'un ticket
// pour pré-remplir le champ assignee.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { suggestAssigneeForTicket } from "@/lib/ai/jobs/workload-optimizer";

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
  const suggestions = await suggestAssigneeForTicket(id);
  return NextResponse.json({ suggestions });
}
