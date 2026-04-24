// ============================================================================
// NEXUS EMAIL TEMPLATE — template unifié pour les notifications système.
//
// Tous les courriels produits par Nexus (ticket assigné, nouveau commentaire,
// renouvellement, backup, monitoring…) passent par `buildNexusEmail()`. Cela
// garantit :
//   - une identité visuelle cohérente avec le portail Nexus (palette slate +
//     accent bleu #2563EB, typographie Inter/system-ui, rayons doux) ;
//   - des couleurs d'accent contextuelles (couleur event-specific) qui
//     restent sobres ;
//   - un pied de page propre avec logo Cetix + mention du lien vers les
//     préférences de notification pour que l'agent puisse se désabonner
//     d'un type d'événement en un clic.
//
// Le rendu est pensé pour :
//   - Gmail / Outlook (web + Mac/Windows), Apple Mail, mobile
//   - Mode clair par défaut (pas de dark mode — on laisse l'agent
//     désactiver le dark mode natif du client mail si besoin)
//   - Largeur 600px max (standard email)
// ============================================================================

import { CETIX_LOGO_BASE64 } from "./logo-base64";

const COMPANY_NAME = process.env.COMPANY_NAME || "Cetix Informatique";
const COMPANY_WEBSITE = process.env.COMPANY_WEBSITE || "";

/** Palette Nexus — miroir des tokens Tailwind du portail. */
export const NEXUS_PALETTE = {
  // Fond page mail (très léger pour laisser la carte ressortir).
  pageBg: "#F1F5F9", // slate-100
  // Carte principale (fond blanc, ombre légère).
  cardBg: "#FFFFFF",
  cardBorder: "#E2E8F0", // slate-200
  cardShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
  // Textes.
  textPrimary: "#0F172A", // slate-900
  textSecondary: "#334155", // slate-700
  textMuted: "#64748B", // slate-500
  textDim: "#94A3B8", // slate-400
  // Accent principal (bleu Nexus).
  accent: "#2563EB", // blue-600
  accentHover: "#1D4ED8", // blue-700
  // Séparateurs.
  divider: "#E2E8F0",
  softBg: "#F8FAFC", // slate-50
} as const;

/** Couleurs par type d'événement — cohérentes avec l'UI portail. */
export const EVENT_ACCENTS: Record<string, { bg: string; fg: string; label: string }> = {
  ticket_assigned: { bg: "#DBEAFE", fg: "#1D4ED8", label: "Ticket assigné" },
  ticket_unassigned_pool: { bg: "#D1FAE5", fg: "#065F46", label: "Nouveau ticket" },
  ticket_collaborator_added: { bg: "#EDE9FE", fg: "#5B21B6", label: "Collaboration" },
  ticket_status_change: { bg: "#FEF3C7", fg: "#92400E", label: "Statut" },
  ticket_comment: { bg: "#DBEAFE", fg: "#1E40AF", label: "Commentaire" },
  ticket_mention: { bg: "#FCE7F3", fg: "#9D174D", label: "Mention" },
  ticket_resolved: { bg: "#D1FAE5", fg: "#065F46", label: "Résolu" },
  ticket_reminder: { bg: "#FEF3C7", fg: "#B45309", label: "Rappel" },
  sla_warning: { bg: "#FEF3C7", fg: "#92400E", label: "SLA" },
  sla_breach: { bg: "#FEE2E2", fg: "#991B1B", label: "SLA dépassé" },
  project_assigned: { bg: "#DBEAFE", fg: "#1D4ED8", label: "Projet" },
  project_status_change: { bg: "#E0E7FF", fg: "#3730A3", label: "Projet" },
  project_task_update: { bg: "#E0E7FF", fg: "#3730A3", label: "Tâche" },
  meeting_invite: { bg: "#E0F2FE", fg: "#075985", label: "Rencontre" },
  meeting_reminder: { bg: "#E0F2FE", fg: "#075985", label: "Rappel" },
  renewal_reminder: { bg: "#FEE2E2", fg: "#991B1B", label: "Renouvellement" },
  backup_failed: { bg: "#FEE2E2", fg: "#991B1B", label: "Sauvegarde" },
  monitoring_alert: { bg: "#FEE2E2", fg: "#991B1B", label: "Alerte" },
  weekly_digest: { bg: "#E0F2FE", fg: "#075985", label: "Résumé" },
  bug_reported: { bg: "#FEE2E2", fg: "#991B1B", label: "Bug signalé" },
  bug_reported_ack: { bg: "#E0F2FE", fg: "#075985", label: "Bug enregistré" },
  bug_fix_proposed: { bg: "#EDE9FE", fg: "#5B21B6", label: "Fix proposé" },
  bug_daily_digest: { bg: "#E0F2FE", fg: "#075985", label: "Résumé bugs" },
};

export interface NexusEmailOptions {
  /** Clé d'événement (cf. events.ts) — sert au choix de la couleur d'accent. */
  event: string;
  /** Preheader (preview text en boîte mail). */
  preheader?: string;
  /** Gros titre sous la bannière de couleur. */
  title: string;
  /** Phrase/sous-titre juste sous le titre. */
  intro?: string;
  /** Lignes "clé → valeur" affichées dans la carte métadonnées. */
  metadata?: { label: string; value: string }[];
  /** Corps principal (texte libre — court de préférence). */
  body?: string;
  /**
   * Citation encadrée (ex: extrait de commentaire, description de ticket).
   * - `content`       : plain text — sera échappé automatiquement.
   * - `contentHtml`   : HTML déjà assaini (via sanitizeEmailHtml) — rendu
   *                     tel quel pour préserver gras, listes, couleurs,
   *                     images inline d'un commentaire ou d'une description.
   * Si les deux sont fournis, contentHtml prime.
   */
  quote?: { author?: string; content?: string; contentHtml?: string };
  /** CTA principal. */
  ctaUrl?: string;
  ctaLabel?: string;
  /** Lien optionnel vers les préférences de notification pour unsubscribe. */
  prefsUrl?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Construit un courriel Nexus-branded. Design : carte blanche 600px,
 * header logo Cetix, bannière d'accent colorée fine, titre, intro, métadonnées
 * en grille, corps, citation optionnelle, CTA, footer avec lien prefs.
 */
export function buildNexusEmail(opts: NexusEmailOptions): string {
  const P = NEXUS_PALETTE;
  const accent = EVENT_ACCENTS[opts.event] ?? { bg: P.cardBorder, fg: P.textSecondary, label: "Notification" };

  const preheader = opts.preheader
    ? `<div style="display:none;font-size:1px;color:${P.pageBg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(opts.preheader)}</div>`
    : "";

  const metadataBlock = opts.metadata && opts.metadata.length > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${P.softBg};border:1px solid ${P.cardBorder};border-radius:10px;margin:0 0 20px;">
         ${opts.metadata
           .map(
             (m) => `<tr>
               <td style="padding:10px 16px;border-bottom:1px solid ${P.cardBorder};width:40%;">
                 <span style="font-size:11px;color:${P.textMuted};text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">${escapeHtml(m.label)}</span>
               </td>
               <td style="padding:10px 16px;border-bottom:1px solid ${P.cardBorder};">
                 <span style="font-size:13px;color:${P.textPrimary};font-weight:500;">${escapeHtml(m.value)}</span>
               </td>
             </tr>`,
           )
           .join("")}
       </table>`
        // Vire la dernière border-bottom (stylé inline — `:last-child` pas
        // toujours honoré en email). Approche pragmatique : on laisse la
        // divider du dernier row, visuellement OK avec le padding.
    : "";

  const quoteBody = opts.quote
    ? opts.quote.contentHtml && opts.quote.contentHtml.trim()
      ? // HTML pré-sanitisé → on le rend tel quel, préserve la mise en
        //   page riche (gras, listes, couleurs, images, signatures…).
        //   On force un `white-space: normal` pour ne pas que les clients
        //   mail qui héritent du pre-wrap du span parent dupliquent les
        //   sauts de ligne du HTML.
        `<div class="nexus-rich" style="font-size:14px;color:${P.textSecondary};line-height:1.6;white-space:normal;">${opts.quote.contentHtml}</div>`
      : // Plain text → on échappe + on garde les sauts de ligne via pre-wrap.
        `<div style="font-size:14px;color:${P.textSecondary};line-height:1.6;white-space:pre-wrap;">${escapeHtml(opts.quote.content ?? "")}</div>`
    : "";
  const quoteBlock = opts.quote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid ${accent.fg};background:${P.softBg};border-radius:0 8px 8px 0;margin:0 0 20px;">
         <tr><td style="padding:14px 18px;">
           ${opts.quote.author ? `<p style="margin:0 0 6px;font-size:12px;color:${P.textMuted};font-weight:600;">${escapeHtml(opts.quote.author)}</p>` : ""}
           ${quoteBody}
         </td></tr>
       </table>`
    : "";

  const ctaBlock = opts.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td>
         <a href="${opts.ctaUrl}" style="display:inline-block;background:${P.accent};color:#FFFFFF;font-size:14px;font-weight:600;padding:11px 24px;border-radius:8px;text-decoration:none;letter-spacing:0.1px;">
           ${escapeHtml(opts.ctaLabel || "Ouvrir dans Nexus")}
         </a>
       </td></tr></table>`
    : "";

  const prefsFooter = opts.prefsUrl
    ? `<p style="margin:14px 0 0;font-size:11px;color:${P.textDim};line-height:1.5;">
         Vous recevez ce courriel parce que vous avez activé les notifications pour ce type d'événement.
         <a href="${opts.prefsUrl}" style="color:${P.textMuted};text-decoration:underline;">Gérer mes préférences</a>.
       </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${P.pageBg};font-family:Inter,'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${P.pageBg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:${P.cardBg};border:1px solid ${P.cardBorder};border-radius:14px;box-shadow:${P.cardShadow};overflow:hidden;">

        <!-- Header logo -->
        <tr><td style="padding:22px 32px 14px;border-bottom:1px solid ${P.cardBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <img src="${CETIX_LOGO_BASE64}" alt="${escapeHtml(COMPANY_NAME)}" width="120" height="auto" style="display:block;height:auto;max-width:120px;" />
            </td>
            <td align="right">
              <span style="display:inline-block;background:${accent.bg};color:${accent.fg};font-size:11px;font-weight:600;padding:4px 10px;border-radius:12px;letter-spacing:0.3px;text-transform:uppercase;">
                ${escapeHtml(accent.label)}
              </span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Title + intro -->
        <tr><td style="padding:26px 32px 6px;">
          <h1 style="margin:0;font-size:20px;line-height:1.35;font-weight:700;color:${P.textPrimary};letter-spacing:-0.2px;">
            ${escapeHtml(opts.title)}
          </h1>
          ${opts.intro ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.55;color:${P.textMuted};">${escapeHtml(opts.intro)}</p>` : ""}
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:18px 32px 8px;">
          ${metadataBlock}
          ${opts.body ? `<div style="margin:0 0 20px;font-size:14px;line-height:1.65;color:${P.textSecondary};">${opts.body}</div>` : ""}
          ${quoteBlock}
          ${ctaBlock}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 32px 26px;border-top:1px solid ${P.cardBorder};background:${P.softBg};">
          <p style="margin:0;font-size:12px;color:${P.textMuted};line-height:1.55;">
            <strong style="color:${P.textSecondary};">Nexus</strong> — plateforme de gestion ${escapeHtml(COMPANY_NAME)}${COMPANY_WEBSITE ? ` · <a href="${COMPANY_WEBSITE}" style="color:${P.textMuted};text-decoration:none;">${escapeHtml(COMPANY_WEBSITE.replace(/^https?:\/\//, ""))}</a>` : ""}
          </p>
          ${prefsFooter}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
