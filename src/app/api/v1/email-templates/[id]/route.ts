import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { invalidateTemplateCache } from "@/lib/email/template-renderer";
import { getValidVariableKeys } from "@/lib/email/variable-catalog";

/** Extrait toutes les `{{var}}` d'une string. Ignore les espaces. */
function extractVariableTokens(s: string): string[] {
  const out: string[] = [];
  s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    out.push(k);
    return _m;
  });
  return out;
}

type Params = { params: Promise<{ id: string }> };

/** GET — détail d'un template (subject + body bruts avec `{{vars}}`). */
export async function GET(_req: Request, { params }: Params) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const t = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "Template introuvable" }, { status: 404 });
  return NextResponse.json(t);
}

/** PATCH — édition. Invalide le cache renderer pour que l'envoi suivant lise la nouvelle version. */
export async function PATCH(req: Request, { params }: Params) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.subject === "string") data.subject = body.subject;
  if (typeof body.body === "string") data.body = body.body;
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  // Validation : extrait les `{{vars}}` du nouveau subject + body et
  // compare au catalogue de l'event. Variables inconnues → renvoie un
  // warning (pas un blocage — l'admin peut vouloir laisser un
  // {{custom_var}} expérimental ; le renderer les ignore avec un log).
  const existing = await prisma.emailTemplate.findUnique({
    where: { id },
    select: { eventKey: true },
  });
  let unknownVars: string[] = [];
  if (existing) {
    const validKeys = getValidVariableKeys(existing.eventKey);
    const subject = (data.subject as string) ?? "";
    const bodyText = (data.body as string) ?? "";
    const referenced = new Set([
      ...extractVariableTokens(subject),
      ...extractVariableTokens(bodyText),
    ]);
    unknownVars = [...referenced].filter((v) => !validKeys.has(v));
  }

  const updated = await prisma.emailTemplate.update({ where: { id }, data });

  // Invalide le cache 60s du renderer pour que le prochain envoi pour
  // ce eventKey relise la version fraîche depuis la DB.
  invalidateTemplateCache(updated.eventKey);

  return NextResponse.json({
    ...updated,
    ...(unknownVars.length > 0 ? { warnings: { unknownVariables: unknownVars } } : {}),
  });
}
