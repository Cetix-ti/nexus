import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { loadSmtpConfig, isConfigured } from "@/lib/smtp/storage";
import { getCurrentUser } from "@/lib/auth-utils";
import { buildBrandedEmailHtml } from "@/lib/email/branded-template";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { to } = (await req.json()) as { to?: string };
  if (!to || !to.includes("@")) {
    return NextResponse.json({ ok: false, error: "Adresse destinataire invalide." }, { status: 400 });
  }

  const cfg = await loadSmtpConfig();
  if (!isConfigured(cfg)) {
    return NextResponse.json(
      { ok: false, error: "Configuration SMTP incomplete." },
      { status: 400 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure === "ssl",
    requireTLS: cfg.secure === "tls",
    ignoreTLS: cfg.secure === "none",
    auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    tls: { rejectUnauthorized: !cfg.allowInvalidCerts },
  });

  const html = buildBrandedEmailHtml({
    headerGradient: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",
    preheader: "Test SMTP Nexus",
    title: "Test SMTP",
    subtitle: "Verification de la configuration email",
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.65;">
        Ceci est un email de test envoye depuis <strong>Nexus</strong>.
      </p>
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px 18px;font-size:13px;color:#166534;font-weight:600;">
        Votre configuration SMTP fonctionne correctement.
      </div>
    `,
  });

  try {
    const info = await transporter.sendMail({
      from: `"${cfg.fromName || "Nexus"}" <${cfg.fromEmail}>`,
      to,
      replyTo: cfg.replyTo || undefined,
      subject: `${cfg.subjectPrefix ? cfg.subjectPrefix + " " : ""}Test SMTP Nexus`,
      text:
        "Ceci est un email de test envoye depuis Nexus.\n\nSi vous lisez ce message, votre configuration SMTP fonctionne correctement.",
      html,
    });
    return NextResponse.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
