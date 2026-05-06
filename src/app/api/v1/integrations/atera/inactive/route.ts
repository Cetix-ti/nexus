import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { findInactiveAgents } from "@/lib/integrations/atera-purge";

/**
 * GET /api/v1/integrations/atera/inactive
 *
 * Query params:
 *   ?days=365             Seuil d'inactivité (default 365)
 *   ?customerIds=1,2,3    Filtre par CustomerID Atera
 *   ?osTypes=server,linux Filtre par OSType (sous-chaîne)
 *   ?includeOnline=1      Inclure aussi les agents en ligne
 *   ?includeExcluded=0    Exclure les agents whitelistés (default: inclus)
 *
 * Réponse : { success, data: { count, inactive: InactiveAgent[] } }
 *
 * RBAC : super-admin uniquement (purge = action destructive critique).
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const days = Math.max(1, Math.min(3650, Number(sp.get("days") ?? "365")));
  const customerIds = sp
    .get("customerIds")
    ?.split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  const osTypes = sp
    .get("osTypes")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const includeOnline = sp.get("includeOnline") === "1";
  const includeExcluded = sp.get("includeExcluded") !== "0";

  try {
    const inactive = await findInactiveAgents({
      days,
      customerIds,
      osTypes,
      includeOnline,
      includeExcluded,
    });
    return NextResponse.json({
      success: true,
      data: { count: inactive.length, inactive },
    });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }
}
