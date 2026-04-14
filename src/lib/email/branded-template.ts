import { CETIX_LOGO_BASE64 } from "./logo-base64";

const COMPANY_NAME = process.env.COMPANY_NAME || "Cetix Informatique";
const COMPANY_PHONE = process.env.COMPANY_PHONE || "";
const COMPANY_WEBSITE = process.env.COMPANY_WEBSITE || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Build a branded HTML email with Cetix logo header, consistent styling,
 * and a professional footer. All templates should use this function.
 */
export function buildBrandedEmailHtml(opts: {
  /** CSS gradient for the header bar, e.g. "linear-gradient(135deg,#1E40AF,#3B82F6)" */
  headerGradient: string;
  /** Short text shown in inbox preview but hidden in email body */
  preheader?: string;
  /** Large title in the colored header */
  title: string;
  /** Smaller subtitle under the title */
  subtitle?: string;
  /** Full HTML for the body section (between header and footer) */
  bodyHtml: string;
  /** Optional CTA button */
  ctaUrl?: string;
  ctaLabel?: string;
  ctaColor?: string;
}): string {
  const ctaBlock = opts.ctaUrl
    ? `<tr>
        <td align="center" style="padding:8px 0 0;">
          <a href="${opts.ctaUrl}" style="display:inline-block;background:${opts.ctaColor || "#2563EB"};color:#FFFFFF;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
            ${opts.ctaLabel || "Voir"}
          </a>
        </td>
      </tr>`
    : "";

  const preheader = opts.preheader
    ? `<div style="display:none;font-size:1px;color:#F1F5F9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${opts.preheader}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:'Segoe UI',Calibri,Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <!-- Logo bar -->
        <tr>
          <td style="background:#FFFFFF;padding:20px 32px 12px;border-bottom:1px solid #E2E8F0;">
            <img src="${CETIX_LOGO_BASE64}" alt="${escapeHtml(COMPANY_NAME)}" width="140" height="auto" style="display:block;height:auto;max-width:140px;" />
          </td>
        </tr>

        <!-- Colored header -->
        <tr>
          <td style="background:${opts.headerGradient};padding:24px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">
              ${opts.title}
            </p>
            ${opts.subtitle ? `<p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.85);line-height:1.4;">${opts.subtitle}</p>` : ""}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td>${opts.bodyHtml}</td></tr>
              ${ctaBlock}
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #E2E8F0;margin:0;"></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:13px;font-weight:600;color:#1E293B;">${escapeHtml(COMPANY_NAME)}</p>
                  ${COMPANY_PHONE ? `<p style="margin:3px 0 0;font-size:12px;color:#64748B;">${escapeHtml(COMPANY_PHONE)}</p>` : ""}
                  ${COMPANY_WEBSITE ? `<p style="margin:3px 0 0;font-size:12px;"><a href="${COMPANY_WEBSITE}" style="color:#2563EB;text-decoration:none;">${escapeHtml(COMPANY_WEBSITE.replace(/^https?:\/\//, ""))}</a></p>` : ""}
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:11px;color:#94A3B8;line-height:1.5;">
              Cet e-mail a &eacute;t&eacute; envoy&eacute; automatiquement par la plateforme ${escapeHtml(COMPANY_NAME)}.
              Vous pouvez consulter vos billets en vous connectant au
              <a href="${APP_URL}" style="color:#2563EB;text-decoration:none;">portail de support</a>.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
