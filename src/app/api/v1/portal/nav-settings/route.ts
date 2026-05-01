// ============================================================================
// GET /api/v1/portal/nav-settings  (portail client)
//
// Retourne les flags de visibilité globale des onglets du portail. Lus
// par PortalLayout pour filtrer la nav selon les choix admin MSP en plus
// des permissions par-org / par-contact habituelles.
//
// Pas d'auth lourde : tous les utilisateurs portail (et même non
// authentifiés) reçoivent la même structure. Les flags ne sont pas
// sensibles — ils dictent juste quelles routes apparaissent dans le menu.
// ============================================================================

import { NextResponse } from "next/server";
import { getPortalNavSettings } from "@/lib/tenant-settings/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getPortalNavSettings();
  return NextResponse.json(settings);
}
