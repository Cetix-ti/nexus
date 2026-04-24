// ============================================================================
// GET /api/v1/permissions — expose le catalogue de permissions (groupes
// + libellés + descriptions) pour l'UI Rôles & Permissions.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { PERMISSION_GROUPS } from "@/lib/permissions/defs";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Lisible par tous les authentifiés — c'est un catalogue statique,
  // pas de données sensibles.
  return NextResponse.json({ groups: PERMISSION_GROUPS });
}
