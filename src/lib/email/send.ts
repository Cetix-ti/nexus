import nodemailer from "nodemailer";
import { loadSmtpConfig, isConfigured } from "@/lib/smtp/storage";

/**
 * Send an email using the stored SMTP configuration.
 * Returns true on success, false on failure (never throws).
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  try {
    const cfg = await loadSmtpConfig();
    if (!isConfigured(cfg)) {
      return false;
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

    const prefix = cfg.subjectPrefix ? `${cfg.subjectPrefix} ` : "";

    await transporter.sendMail({
      from: `"${cfg.fromName || "Nexus"}" <${cfg.fromEmail}>`,
      to,
      replyTo: cfg.replyTo || undefined,
      subject: `${prefix}${subject}`,
      html,
    });

    return true;
  } catch (err) {
    console.error("[sendEmail] Erreur lors de l'envoi :", err);
    return false;
  }
}
