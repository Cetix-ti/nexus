// ============================================================================
// GET /api/v1/tickets/[id]/suggested-kb
//
// Retourne les articles KB les plus pertinents pour ce ticket, calculés par
// similarité sémantique entre les embeddings (job `kb-indexer`). Utilisé par
// le widget "Articles KB pertinents" sur la page ticket.
//
// Ne nécessite pas de re-générer un embedding : si le ticket est déjà indexé
// par le job `ticket-embeddings`, on réutilise. Sinon, calcul à la demande.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { suggestKbArticlesForTicket } from "@/lib/ai/jobs/kb-indexer";

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
  try {
    const suggestions = await suggestKbArticlesForTicket(id, 3);
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.warn("[suggested-kb] failed:", err);
    return NextResponse.json({ suggestions: [] });
  }
}
