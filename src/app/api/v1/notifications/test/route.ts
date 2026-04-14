import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { getCurrentUser } from "@/lib/auth-utils";
import { buildBrandedEmailHtml } from "@/lib/email/branded-template";

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
        body: "Ceci est une notification de test envoyee depuis les parametres Nexus. Si vous la voyez, les notifications in-app fonctionnent correctement.",
        link: "/settings",
        metadata: { test: true, sentAt: new Date().toISOString() },
      },
    });
    results.inapp = true;
  }

  // Email test notification
  if ((type === "email" || type === "both") && emailTo) {
    const html = buildBrandedEmailHtml({
      headerGradient: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",
      preheader: "Test de notification",
      title: "Test de notification email",
      subtitle: "Configuration Nexus",
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.65;">
          Ceci est un email de test envoy&eacute; depuis les param&egrave;tres Nexus.
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.65;">
          Si vous lisez ce message, votre configuration SMTP et vos mod&egrave;les d'email fonctionnent correctement.
        </p>
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px 18px;font-size:13px;color:#166534;font-weight:600;">
          Les notifications email sont op&eacute;rationnelles.
        </div>
      `,
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings`,
      ctaLabel: "Ouvrir les parametres",
      ctaColor: "#2563EB",
    });

    results.email = await sendEmail(
      emailTo,
      "Test de notification Nexus",
      html,
    );
  }

  return NextResponse.json({ ok: true, results });
}
