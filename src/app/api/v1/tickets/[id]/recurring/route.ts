// ============================================================================
// GET /api/v1/tickets/[id]/recurring
//
// Retourne le pattern récurrent auquel appartient ce ticket, s'il y en a un.
// Alimenté par le job `recurring-tickets-detector` (toutes les 12h).
//
// Signal pour le tech : "c'est la Nème fois qu'on voit ça chez ce client
// en X mois — envisager une intervention de root-cause plutôt qu'un fix
// de surface".
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getRecurringPatternForTicket } from "@/lib/ai/jobs/recurring-detector";

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
  const pattern = await getRecurringPatternForTicket(id);
  if (!pattern) {
    return NextResponse.json({ isRecurring: false });
  }
  return NextResponse.json(pattern);
}
