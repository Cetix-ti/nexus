import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { EVENT_VARIABLES, getVariablesForEvent } from "@/lib/email/variable-catalog";

/**
 * GET /api/v1/email-templates/variables[?eventKey=...]
 *
 * Sans paramètre : retourne le catalogue complet par event.
 * Avec eventKey : retourne uniquement les variables de cet event (pour
 * alimenter le picker UI dans la modale d'édition).
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const eventKey = url.searchParams.get("eventKey");
  if (eventKey) {
    return NextResponse.json({ eventKey, variables: getVariablesForEvent(eventKey) });
  }
  return NextResponse.json({ events: EVENT_VARIABLES });
}
