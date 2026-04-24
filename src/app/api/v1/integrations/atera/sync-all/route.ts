import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { syncAllMappedOrgs } from "@/lib/integrations/atera-sync";

/**
 * Sync Atera pour toutes les organisations mappées.
 *
 * Authentification :
 *   - Header `Authorization: Bearer <CRON_SECRET>` pour un cron externe
 *   - OU session MSP_ADMIN pour un déclenchement manuel depuis l'UI
 *
 * Déclenchement typique (crontab) :
 *   0 3 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://nexus.cetix.ca/api/v1/integrations/atera/sync-all
 *
 * La logique de sync vit dans `@/lib/integrations/atera-sync` et est
 * aussi appelée par le background job ENABLE_ATERA_AUTOSYNC=1.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const result = await syncAllMappedOrgs();
  return NextResponse.json(result);
}
