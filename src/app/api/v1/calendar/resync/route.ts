// ============================================================================
// POST /api/v1/calendar/resync
//
// Déclenche manuellement un pull Outlook → Nexus du calendrier partagé
// "Agenda général". Utilisable quand le job automatique est désactivé
// (DISABLE_BACKGROUND_JOBS=1) ou simplement pour forcer une synchro
// immédiate après une modification Outlook.
//
// Retourne les compteurs create/update/delete/undecoded + fetched pour
// afficher un toast à l'utilisateur.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { pullOutlookLocations } from "@/lib/calendar/location-sync";

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Tout tech/admin peut déclencher — c'est une opération idempotente qui
  // ne modifie que les events Nexus sur la base d'Outlook (source de vérité).
  if (!["SUPER_ADMIN", "MSP_ADMIN", "TECHNICIAN"].includes(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await pullOutlookLocations();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de la synchro" },
      { status: 500 },
    );
  }
}
