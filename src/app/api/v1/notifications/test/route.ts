import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { getCurrentUser } from "@/lib/auth-utils";
import { buildNexusEmail } from "@/lib/email/nexus-template";
import { getPortalBaseUrl } from "@/lib/portal-domain/url";

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const type = body.type as "inapp" | "email" | "both";
  const emailTo = body.to as string | undefined;

  const results: { inapp?: boolean; email?: boolean } = {};

  // In-app test notification
  if (type === "inapp" || type === "both") {
    await prisma.notification.create({
      data: {
        userId: me.id,
        type: "test",
        title: "Notification de test",
        body:
          "Ceci est une notification de test envoyée depuis les paramètres Nexus. " +
          "Si vous la voyez, les notifications in-app fonctionnent correctement.",
        link: "/settings",
        metadata: { test: true, sentAt: new Date().toISOString() },
      },
    });
    results.inapp = true;
  }

  // Email test via le template Nexus unifié — vérifie en même temps SMTP
  // + rendu branding (logo Cetix, palette, footer, CTA).
  if ((type === "email" || type === "both") && emailTo) {
    const base = await getPortalBaseUrl();
    const html = buildNexusEmail({
      event: "weekly_digest",
      preheader: "Test de notification Nexus",
      title: "Tout fonctionne correctement",
      intro:
        "Ce courriel confirme que votre configuration SMTP et le template " +
        "Nexus-branded sont opérationnels.",
      metadata: [
        { label: "Testé par", value: `${me.firstName} ${me.lastName}`.trim() },
        { label: "Envoyé à", value: emailTo },
        { label: "Horodatage", value: new Date().toLocaleString("fr-CA") },
      ],
      body: `<p style="margin:0;">Si vous lisez ce message, toutes les pièces sont en place : connexion SMTP, moteur de template, et branding. Vous pouvez dès maintenant configurer vos préférences par type d'événement dans « Mon compte » → « Notifications ».</p>`,
      ctaUrl: `${base}/account?tab=notifications`,
      ctaLabel: "Ouvrir mes préférences",
      prefsUrl: `${base}/account?tab=notifications`,
    });

    results.email = await sendEmail(emailTo, "Test de notification Nexus", html);
  }

  return NextResponse.json({ ok: true, results });
}
