import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const COMPANY_NAME = process.env.COMPANY_NAME || "Nexus Support";
const COMPANY_PHONE = process.env.COMPANY_PHONE || "";
const COMPANY_WEBSITE = process.env.COMPANY_WEBSITE || "";

// ---------------------------------------------------------------------------
// Professional email template — Outlook-quality design
// ---------------------------------------------------------------------------

function buildCommentEmailHtml(opts: {
  ticketNumber: number;
  ticketSubject: string;
  authorName: string;
  content: string;
  isInternal: boolean;
  ticketUrl: string;
  priority?: string;
  status?: string;
}): string {
  const priorityColors: Record<string, string> = {
    CRITICAL: "#EF4444",
    HIGH: "#F97316",
    MEDIUM: "#EAB308",
    LOW: "#22C55E",
  };
  const priorityColor = opts.priority ? (priorityColors[opts.priority] || "#6B7280") : "#6B7280";

  const internalBanner = opts.isInternal
    ? `<tr><td style="padding:0 0 16px 0;">
        <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:6px;padding:8px 14px;font-size:12px;color:#92400E;font-weight:600;">
          Note interne — visible uniquement par l'équipe technique
        </div>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:'Segoe UI',Calibri,Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1E40AF 0%,#3B82F6 100%);padding:24px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">
                    Billet #${opts.ticketNumber}
                  </p>
                  <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.85);line-height:1.4;">
                    ${escapeHtml(opts.ticketSubject)}
                  </p>
                </td>
                <td align="right" valign="top" style="padding-top:4px;">
                  <span style="display:inline-block;background:${priorityColor};color:#FFFFFF;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">
                    ${opts.priority ? opts.priority.toLowerCase() : ""}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${internalBanner}

              <!-- Author -->
              <tr>
                <td style="padding:0 0 20px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:12px;">
                        <div style="width:36px;height:36px;border-radius:50%;background:#E2E8F0;text-align:center;line-height:36px;font-size:14px;font-weight:700;color:#475569;">
                          ${getInitialsHtml(opts.authorName)}
                        </div>
                      </td>
                      <td style="vertical-align:middle;">
                        <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${escapeHtml(opts.authorName)}</p>
                        <p style="margin:2px 0 0;font-size:12px;color:#94A3B8;">a ajouté un commentaire</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Comment content -->
              <tr>
                <td style="padding:0 0 24px 0;">
                  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;font-size:14px;color:#334155;line-height:1.65;white-space:pre-wrap;">
${escapeHtml(stripHtmlTags(opts.content))}
                  </div>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td align="center" style="padding:0 0 8px 0;">
                  <a href="${opts.ticketUrl}" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
                    Voir le billet
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #E2E8F0;margin:0;"></td></tr>

        <!-- Footer / Signature -->
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
              Cet e-mail a été envoyé automatiquement par la plateforme ${escapeHtml(COMPANY_NAME)}.
              Vous pouvez répondre directement à ce billet en vous connectant au
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

/** Build email for new ticket creation notification */
function buildNewTicketEmailHtml(opts: {
  ticketNumber: number;
  ticketSubject: string;
  ticketDescription: string;
  requesterName: string;
  organizationName: string;
  priority: string;
  ticketUrl: string;
}): string {
  const priorityColors: Record<string, string> = {
    CRITICAL: "#EF4444",
    HIGH: "#F97316",
    MEDIUM: "#EAB308",
    LOW: "#22C55E",
  };
  const priorityColor = priorityColors[opts.priority] || "#6B7280";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:'Segoe UI',Calibri,Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#059669 0%,#10B981 100%);padding:24px 32px;">
            <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.5px;">Nouveau billet créé</p>
            <p style="margin:8px 0 0;font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">
              #${opts.ticketNumber} — ${escapeHtml(opts.ticketSubject)}
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <!-- Metadata -->
              <tr>
                <td style="padding:0 0 20px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
                    <tr>
                      <td style="padding:14px 18px;border-right:1px solid #E2E8F0;" width="33%">
                        <p style="margin:0;font-size:11px;color:#94A3B8;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Demandeur</p>
                        <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#1E293B;">${escapeHtml(opts.requesterName)}</p>
                      </td>
                      <td style="padding:14px 18px;border-right:1px solid #E2E8F0;" width="33%">
                        <p style="margin:0;font-size:11px;color:#94A3B8;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Organisation</p>
                        <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#1E293B;">${escapeHtml(opts.organizationName)}</p>
                      </td>
                      <td style="padding:14px 18px;" width="33%">
                        <p style="margin:0;font-size:11px;color:#94A3B8;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Priorité</p>
                        <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:${priorityColor};">${opts.priority.toLowerCase()}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Description -->
              <tr>
                <td style="padding:0 0 24px 0;">
                  <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;">Description</p>
                  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;font-size:14px;color:#334155;line-height:1.65;white-space:pre-wrap;">
${escapeHtml(opts.ticketDescription.slice(0, 500))}${opts.ticketDescription.length > 500 ? "…" : ""}
                  </div>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td align="center" style="padding:0 0 8px 0;">
                  <a href="${opts.ticketUrl}" style="display:inline-block;background:#059669;color:#FFFFFF;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
                    Ouvrir le billet
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #E2E8F0;margin:0;"></td></tr>
        <tr>
          <td style="padding:20px 32px 24px;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#1E293B;">${escapeHtml(COMPANY_NAME)}</p>
            <p style="margin:12px 0 0;font-size:11px;color:#94A3B8;line-height:1.5;">
              Cet e-mail a été envoyé automatiquement par ${escapeHtml(COMPANY_NAME)}.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function getInitialsHtml(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function notifyCommentAdded(
  ticketId: string,
  comment: { authorName: string; authorId?: string; content: string; isInternal: boolean },
): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        number: true,
        subject: true,
        priority: true,
        status: true,
        requesterId: true,
        assigneeId: true,
        requester: { select: { email: true, firstName: true, lastName: true } },
        assignee: { select: { email: true, firstName: true, lastName: true, id: true } },
      },
    });

    if (!ticket) return;

    const ticketUrl = `${APP_URL}/tickets/${ticket.number}`;
    const subject = `[#${ticket.number}] ${ticket.subject}`;

    const html = buildCommentEmailHtml({
      ticketNumber: ticket.number,
      ticketSubject: ticket.subject,
      authorName: comment.authorName,
      content: comment.content,
      isInternal: comment.isInternal,
      ticketUrl,
      priority: ticket.priority,
      status: ticket.status,
    });

    if (comment.isInternal) {
      // Internal note → only notify assigned agent (never the requester)
      if (ticket.assignee?.email && ticket.assignee.id !== comment.authorId) {
        await sendEmail(ticket.assignee.email, subject, html);
      }
      return;
    }

    // Public comment — figure out direction using IDs (reliable) with name fallback
    const authorIsAgent = comment.authorId
      ? comment.authorId === ticket.assigneeId
      : ticket.assignee
        ? comment.authorName.trim().toLowerCase() ===
          `${ticket.assignee.firstName} ${ticket.assignee.lastName}`.trim().toLowerCase()
        : false;

    if (authorIsAgent) {
      // Agent replied → notify requester
      if (ticket.requester?.email) {
        await sendEmail(ticket.requester.email, subject, html);
      }
    } else {
      // Requester (or someone else) replied → notify assigned agent
      if (ticket.assignee?.email) {
        await sendEmail(ticket.assignee.email, subject, html);
      }
    }
  } catch (err) {
    console.error("[notifyCommentAdded] Erreur :", err);
  }
}

export async function notifyTicketCreated(ticketId: string): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        number: true,
        subject: true,
        description: true,
        priority: true,
        assigneeId: true,
        requester: { select: { firstName: true, lastName: true } },
        organization: { select: { name: true } },
        assignee: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (!ticket || !ticket.assignee?.email) return;

    const ticketUrl = `${APP_URL}/tickets/${ticket.number}`;
    const subject = `[Nouveau] #${ticket.number} — ${ticket.subject}`;

    const html = buildNewTicketEmailHtml({
      ticketNumber: ticket.number,
      ticketSubject: ticket.subject,
      ticketDescription: ticket.description,
      requesterName: ticket.requester
        ? `${ticket.requester.firstName} ${ticket.requester.lastName}`
        : "—",
      organizationName: ticket.organization?.name ?? "—",
      priority: ticket.priority,
      ticketUrl,
    });

    await sendEmail(ticket.assignee.email, subject, html);
  } catch (err) {
    console.error("[notifyTicketCreated] Erreur :", err);
  }
}
