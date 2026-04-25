// POST /api/v1/policies/scripts/extract-vars
// Reverse-engineering : reçoit un script déjà adapté à un client + langage,
// retourne le template générique + les variables détectées + leurs valeurs
// résolues pour ce client.
//
// L'endpoint NE CRÉE RIEN en DB — il retourne juste l'analyse pour validation
// par l'agent. La création atomique du ScriptTemplate + ScriptInstance se fait
// via POST /api/v1/policies/scripts/import-from-instance après validation.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";
import { extractScriptVariables, type ScriptLanguage } from "@/lib/ai/features/script-extract-vars";

const VALID_LANGS: ScriptLanguage[] = ["powershell", "bash", "python", "batch", "javascript", "other"];

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code : "";
  const language = (typeof body?.language === "string" ? body.language : "powershell") as ScriptLanguage;
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : null;

  if (!code.trim()) return NextResponse.json({ error: "code requis" }, { status: 400 });
  if (code.length > 50_000) return NextResponse.json({ error: "Script trop long (max 50k chars)" }, { status: 400 });
  if (!VALID_LANGS.includes(language)) return NextResponse.json({ error: `language invalide (${VALID_LANGS.join(", ")})` }, { status: 400 });

  let organizationName: string | undefined;
  if (organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (org) organizationName = org.name;
  }

  const result = await extractScriptVariables({
    clientCode: code,
    language,
    organizationName,
  });

  if (!result) {
    return NextResponse.json({ error: "L'IA n'a pas pu analyser le script. Réessaye ou simplifie." }, { status: 502 });
  }

  return NextResponse.json(result);
}
