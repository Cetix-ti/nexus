// POST /api/v1/backup-templates/refresh
// Régénère les templates colonne 1 à partir des alertes Veeam FAILED récentes.
// Action idempotente — préserve les titres édités par l'agent et ne touche
// pas aux tickets colonne 2 (qui vivent dans la table Ticket).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { refreshTemplates } from "@/lib/backup-kanban/service";

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await refreshTemplates();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
