// ============================================================================
// GET /api/v1/portal/published-dashboards
//
// Retourne les dashboards publiés visibles par le contact courant :
//   - publications scoped sur son organizationId
//   - publications "toutes organisations" (organizationId null) optionnellement
//     affichables si l'admin l'a décidé (rare)
//
// Le contenu renvoyé est le SNAPSHOT JSON figé au moment de la publication —
// widgets + layout, exactement comme l'agent les avait au moment de cliquer
// "Publier". Le portail ne voit PAS les modifications ultérieures côté agent
// tant que l'agent n'a pas re-publié.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET() {
  const me = await getCurrentPortalUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.permissions.canSeeReports) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.publishedDashboard.findMany({
    where: {
      OR: [
        { organizationId: me.organizationId },
        { organizationId: null }, // dashboards "globaux"
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    dashboardKey: r.dashboardKey,
    label: r.label,
    description: r.description,
    config: r.config,
    updatedAt: r.updatedAt.toISOString(),
  })));
}
