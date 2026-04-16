// GET / PUT / POST /api/v1/settings/wazuh
// Configuration de l'intégration Wazuh Indexer + test de connexion.

import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import {
  getWazuhConfig,
  saveWazuhConfig,
  testWazuhConnection,
  type WazuhConfig,
} from "@/lib/security-center/wazuh-client";

function sanitize(cfg: WazuhConfig) {
  // On masque le mot de passe pour le retour — on ne veut pas qu'il
  // transite en clair dans la réponse, surtout après un refresh.
  return { ...cfg, password: cfg.password ? "••••••••" : "" };
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cfg = await getWazuhConfig();
  return NextResponse.json(sanitize(cfg));
}

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  // Le password n'est écrasé que si l'admin en a saisi un nouveau
  // (pas le placeholder "••••••••" qu'on renvoie sur GET).
  const patch: Partial<WazuhConfig> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.apiUrl === "string") patch.apiUrl = body.apiUrl.trim();
  if (typeof body.username === "string") patch.username = body.username.trim();
  if (typeof body.password === "string" && !/^•+$/.test(body.password)) {
    patch.password = body.password;
  }
  if (typeof body.minLevel === "number") patch.minLevel = body.minLevel;
  if (Array.isArray(body.downgradeKeywords)) {
    patch.downgradeKeywords = body.downgradeKeywords.filter(
      (k: unknown): k is string => typeof k === "string",
    );
  }
  const saved = await saveWazuhConfig(patch);
  return NextResponse.json(sanitize(saved));
}

export async function POST(req: Request) {
  // Test de connexion. Accepte soit la config stockée (body vide),
  // soit une config fournie en body (permet de tester avant save).
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const stored = await getWazuhConfig();
  const cfg: WazuhConfig = {
    enabled: stored.enabled,
    apiUrl: (typeof body.apiUrl === "string" ? body.apiUrl : stored.apiUrl).replace(/\/$/, ""),
    username: typeof body.username === "string" ? body.username : stored.username,
    downgradeKeywords: stored.downgradeKeywords,
    password:
      typeof body.password === "string" && !/^•+$/.test(body.password)
        ? body.password
        : stored.password,
    minLevel: typeof body.minLevel === "number" ? body.minLevel : stored.minLevel,
  };
  if (!cfg.apiUrl || !cfg.username) {
    return NextResponse.json({ ok: false, error: "URL et user requis" }, { status: 400 });
  }
  return NextResponse.json(await testWazuhConnection(cfg));
}
