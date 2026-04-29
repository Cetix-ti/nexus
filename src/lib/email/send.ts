import nodemailer from "nodemailer";
import { loadSmtpConfig, isConfigured } from "@/lib/smtp/storage";

export interface SendEmailOptions {
  /** Raw plain-text alternative for MUA that can't render HTML. */
  text?: string;
  /**
   * Force un Message-ID précis. Laisser vide = nodemailer en génère un.
   * On passe notre propre id quand on veut garder la cohérence avec un
   * Comment en DB (threading Freshservice-style).
   */
  messageId?: string;
  /** Message-ID du message auquel on répond (header In-Reply-To). */
  inReplyTo?: string;
  /** Chaîne de Message-IDs précédents (header References). */
  references?: string[];
  /**
   * Surcharge le From (nom/email). Par défaut on prend la config SMTP.
   * Utile pour qu'un reply s'affiche comme venant de billets@cetix.ca
   * plutôt que "notifications@...".
   */
  from?: { name?: string; email: string };
  /**
   * Surcharge le Reply-To. Pour les replies de ticket, on veut
   * Reply-To = l'adresse d'ingestion (billets@cetix.ca) pour que le
   * client puisse répondre au courriel et retomber dans le pipeline.
   */
  replyTo?: string;
  /** En-têtes libres supplémentaires. */
  extraHeaders?: Record<string, string>;
  /**
   * Désactive le tag `Auto-Submitted: auto-generated`. Par défaut, tous
   * les emails sortants Nexus posent ce header (RFC 3834) pour que les
   * serveurs SMTP destinataires NE déclenchent PAS leur auto-reply
   * (Out-of-Office, etc.) — sinon boucle de tickets fantômes côté
   * inbox d'ingestion. À mettre à `true` UNIQUEMENT pour les vraies
   * réponses de ticket (ticket-reply.ts) qu'on veut traiter comme une
   * conversation humaine normale (threading, OOO légitime, etc.).
   */
  skipAutoSubmittedHeader?: boolean;
}

/**
 * Send an email using the stored SMTP configuration.
 * Returns true on success, false on failure (never throws).
 *
 * Pour les usages avancés (threading Freshservice-style avec Message-ID,
 * In-Reply-To, References), préférer `sendEmailWithMeta()` qui retourne
 * aussi le Message-ID effectivement envoyé.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options: SendEmailOptions = {},
): Promise<boolean> {
  const res = await sendEmailWithMeta(to, subject, html, options);
  return res.ok;
}

/**
 * Variante qui retourne le Message-ID utilisé (fourni ou généré) —
 * nécessaire pour les replies de ticket où on veut persister le
 * Message-ID dans Comment.messageId pour thread les futurs replies.
 */
export async function sendEmailWithMeta(
  to: string,
  subject: string,
  html: string,
  options: SendEmailOptions = {},
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const cfg = await loadSmtpConfig();
    if (!isConfigured(cfg)) {
      return { ok: false, error: "SMTP not configured" };
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

    const fromName = options.from?.name ?? "Nexus";
    const fromEmail = options.from?.email ?? cfg.fromEmail;

    // Header RFC 3834 : signale aux serveurs SMTP destinataires que ce
    // courriel est généré automatiquement → ils ne déclenchent PAS leur
    // auto-reply (OOO Outlook, vacation Gmail, etc.). Évite la boucle
    // « Nexus envoie une notif → OOO du destinataire répond → Nexus
    // crée un faux ticket ».
    const headers: Record<string, string> = { ...(options.extraHeaders ?? {}) };
    if (!options.skipAutoSubmittedHeader && !headers["Auto-Submitted"] && !headers["auto-submitted"]) {
      headers["Auto-Submitted"] = "auto-generated";
    }

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      replyTo: options.replyTo ?? cfg.replyTo ?? undefined,
      subject,
      html,
      text: options.text,
      messageId: options.messageId,
      inReplyTo: options.inReplyTo,
      references: options.references,
      headers,
    });

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error("[sendEmail] Erreur lors de l'envoi :", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
