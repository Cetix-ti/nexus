import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { loadSmtpConfig, saveSmtpConfig, isConfigured } from "@/lib/smtp/storage";
import { getCurrentUser } from "@/lib/auth-utils";

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = await loadSmtpConfig();
  if (!isConfigured(cfg)) {
    return NextResponse.json(
      { ok: false, error: "Configuration SMTP incomplète. Hôte, port, utilisateur et adresse d'envoi sont requis." },
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

  try {
    await transporter.verify();
    const next = {
      ...cfg,
      lastTestAt: new Date().toISOString(),
      lastTestSuccess: true,
      lastTestError: undefined,
    };
    await saveSmtpConfig(next);
    return NextResponse.json({ ok: true, message: "Connexion SMTP vérifiée avec succès." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const next = {
      ...cfg,
      lastTestAt: new Date().toISOString(),
      lastTestSuccess: false,
      lastTestError: msg,
    };
    await saveSmtpConfig(next);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
