import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { loadSmtpConfig, isConfigured } from "@/lib/smtp/storage";
import { getCurrentUser } from "@/lib/auth-utils";
import { buildNexusEmail } from "@/lib/email/nexus-template";

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

  const html = buildNexusEmail({
    event: "weekly_digest",
    preheader: "Test SMTP Nexus",
    title: "Test SMTP réussi",
    intro: "Votre configuration SMTP fonctionne correctement.",
    metadata: [
      { label: "Hôte", value: cfg.host },
      { label: "Port", value: String(cfg.port) },
      { label: "Mode", value: cfg.secure.toUpperCase() },
      { label: "Expéditeur", value: cfg.fromEmail },
    ],
    body: `<p style="margin:0;">Ce courriel de test confirme que Nexus parvient à dialoguer avec votre serveur SMTP et utilise correctement le template unifié. Vous pouvez maintenant activer les notifications sortantes.</p>`,
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
