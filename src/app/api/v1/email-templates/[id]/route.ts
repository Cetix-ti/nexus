import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { invalidateTemplateCache } from "@/lib/email/template-renderer";

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

  const updated = await prisma.emailTemplate.update({ where: { id }, data });

  // Invalide le cache 60s du renderer pour que le prochain envoi pour
  // ce eventKey relise la version fraîche depuis la DB.
  invalidateTemplateCache(updated.eventKey);

  return NextResponse.json(updated);
}
