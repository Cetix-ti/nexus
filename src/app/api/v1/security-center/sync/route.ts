// POST /api/v1/security-center/sync
// Déclenche une synchro historique des dossiers de sécurité (AD/Wazuh).
// Body : { sinceDays?: number, folders?: string[], source?: "email" | "wazuh-api" }
//   - sinceDays  : 0 ou omis = tout l'historique disponible
//   - folders    : (email uniquement) liste explicite ; défaut = securityFolders
//   - source     : "email" (défaut) ou "wazuh-api" pour tirer depuis l'API

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { syncSecurityHistorical, syncWazuhApi } from "@/lib/security-center/jobs";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const sinceDays = typeof body?.sinceDays === "number" ? body.sinceDays : undefined;
  const folders = Array.isArray(body?.folders) ? body.folders : undefined;
  const source: string = typeof body?.source === "string" ? body.source : "email";

  if (source === "wazuh-api") {
    const res = await syncWazuhApi({ sinceDays });
    return NextResponse.json(res);
  }
  const result = await syncSecurityHistorical({ sinceDays, folders });
  return NextResponse.json(result);
}
