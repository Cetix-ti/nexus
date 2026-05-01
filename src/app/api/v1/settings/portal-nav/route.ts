// ============================================================================
// GET / PUT /api/v1/settings/portal-nav
//
// Lecture/écriture du contrôle global des onglets du portail client.
// Stocké dans `tenant_settings` clé `portal.nav`. Réservé aux admins MSP.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getPortalNavSettings, setSetting } from "@/lib/tenant-settings/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await getPortalNavSettings();
  return NextResponse.json(settings);
}

interface PutBody {
  tabs?: Record<string, unknown>;
}

const TAB_KEYS = [
  "home", "tickets", "approvals", "assets", "projects", "reports",
  "finances", "contacts", "particularities", "policies", "software",
  "changes", "renewals", "budget",
] as const;

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.tabs || typeof body.tabs !== "object") {
    return NextResponse.json({ error: "tabs requis" }, { status: 400 });
  }
  // Whitelist : on ne stocke que les clés connues (ignore les inconnues
  // pour éviter qu'un payload abusif pollue le settings JSON).
  const tabs: Record<string, boolean> = {};
  for (const k of TAB_KEYS) {
    tabs[k] = !!(body.tabs as Record<string, unknown>)[k];
  }
  // setSetting fait un merge avec le default → on passe juste { tabs }.
  const saved = await setSetting("portal.nav", { tabs: tabs as never });
  return NextResponse.json(saved);
}
