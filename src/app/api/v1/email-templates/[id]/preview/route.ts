import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { buildExamplePayload } from "@/lib/email/variable-catalog";
import { renderTemplateForEvent } from "@/lib/email/template-renderer";
import { sendEmail } from "@/lib/email/send";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/email-templates/[id]/preview
 *
 * Rend le template avec un payload "exemple" tiré du catalogue de
 * variables. Body :
 *   - { mode: "html" }      → retourne `{ subject, html }` pour preview UI
 *   - { mode: "send", to }  → envoie un email réel à `to` (admin only)
 */
export async function POST(req: Request, { params }: Params) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const tpl = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!tpl) return NextResponse.json({ error: "Template introuvable" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "send" ? "send" : "html";

  const payload = buildExamplePayload(tpl.eventKey);
  const rendered = await renderTemplateForEvent(tpl.eventKey, {
    payload,
    fallback: {
      event: tpl.eventKey,
      title: tpl.name,
      intro: "Aperçu du template avec données factices",
      body: "(corps remplacé par le template DB)",
    },
  });

  if (mode === "send") {
    const to = typeof body.to === "string" ? body.to : me.email;
    if (!to || !/@/.test(to)) {
      return NextResponse.json({ error: "Destinataire invalide" }, { status: 400 });
    }
    const ok = await sendEmail(to, `[PREVIEW] ${rendered.subject}`, rendered.html);
    return NextResponse.json({ ok, sentTo: to, source: rendered.source });
  }

  return NextResponse.json({
    subject: rendered.subject,
    html: rendered.html,
    source: rendered.source,
  });
}
