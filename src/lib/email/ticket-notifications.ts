import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { buildBrandedEmailHtml } from "@/lib/email/branded-template";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// Contact notification guard
// ---------------------------------------------------------------------------
// By default, email notifications to portal contacts (non-agents) are DISABLED.
// This prevents mass-emailing all clients before the portal is fully launched.
// To enable for a specific contact, set Contact.portalStatus = "notify_enabled"
// or toggle it in the admin UI.
// ---------------------------------------------------------------------------

async function isContactNotificationEnabled(contactId: string): Promise<boolean> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { portalStatus: true },
  });
  return contact?.portalStatus === "notify_enabled";
}

// ---------------------------------------------------------------------------
// HTML builders (using branded template)
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
  const priorityColor = opts.priority
    ? priorityColors[opts.priority] || "#6B7280"
    : "#6B7280";

  const internalBanner = opts.isInternal
    ? `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:6px;padding:8px 14px;font-size:12px;color:#92400E;font-weight:600;margin-bottom:16px;">
        Note interne &mdash; visible uniquement par l'&eacute;quipe technique
      </div>`
    : "";

  const bodyHtml = `
    ${internalBanner}
    <!-- Author -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="vertical-align:middle;padding-right:12px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#E2E8F0;text-align:center;line-height:36px;font-size:14px;font-weight:700;color:#475569;">
            ${getInitials(opts.authorName)}
          </div>
        </td>
        <td style="vertical-align:middle;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${escapeHtml(opts.authorName)}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#94A3B8;">a ajout&eacute; un commentaire</p>
        </td>
      </tr>
    </table>
    <!-- Comment content -->
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;font-size:14px;color:#334155;line-height:1.65;white-space:pre-wrap;margin-bottom:24px;">${escapeHtml(stripHtmlTags(opts.content))}</div>
    <!-- Priority badge -->
    ${opts.priority ? `<p style="margin:0 0 8px;"><span style="display:inline-block;background:${priorityColor};color:#FFFFFF;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">${opts.priority.toLowerCase()}</span></p>` : ""}
  `;

  return buildBrandedEmailHtml({
    headerGradient: "linear-gradient(135deg,#1E40AF 0%,#3B82F6 100%)",
    preheader: `${opts.authorName} a commente le billet #${opts.ticketNumber}`,
    title: `Billet #${opts.ticketNumber}`,
    subtitle: escapeHtml(opts.ticketSubject),
    bodyHtml,
    ctaUrl: opts.ticketUrl,
    ctaLabel: "Voir le billet",
    ctaColor: "#2563EB",
  });
}

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

  const bodyHtml = `
    <!-- Metadata -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:20px;">
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
          <p style="margin:0;font-size:11px;color:#94A3B8;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Priorit&eacute;</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:${priorityColor};">${opts.priority.toLowerCase()}</p>
        </td>
      </tr>
    </table>
    <!-- Description -->
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;">Description</p>
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;font-size:14px;color:#334155;line-height:1.65;white-space:pre-wrap;margin-bottom:24px;">${escapeHtml(opts.ticketDescription.slice(0, 500))}${opts.ticketDescription.length > 500 ? "&hellip;" : ""}</div>
  `;

  return buildBrandedEmailHtml({
    headerGradient: "linear-gradient(135deg,#059669 0%,#10B981 100%)",
    preheader: `Nouveau billet #${opts.ticketNumber} - ${opts.ticketSubject}`,
    title: `#${opts.ticketNumber} — ${escapeHtml(opts.ticketSubject)}`,
    subtitle: "Nouveau billet cr&eacute;&eacute;",
    bodyHtml,
    ctaUrl: opts.ticketUrl,
    ctaLabel: "Ouvrir le billet",
    ctaColor: "#059669",
  });
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

function getInitials(name: string): string {
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
  comment: {
    authorName: string;
    authorId?: string;
    content: string;
    isInternal: boolean;
  },
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
        requester: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignee: {
          select: { email: true, firstName: true, lastName: true, id: true },
        },
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
      // Internal note -> only notify assigned agent (never the requester)
      if (ticket.assignee?.email && ticket.assignee.id !== comment.authorId) {
        await sendEmail(ticket.assignee.email, subject, html);
      }
      return;
    }

    // Public comment — determine direction
    const authorIsAgent = comment.authorId
      ? comment.authorId === ticket.assigneeId
      : ticket.assignee
        ? comment.authorName.trim().toLowerCase() ===
          `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
            .trim()
            .toLowerCase()
        : false;

    if (authorIsAgent) {
      // Agent replied -> notify requester (Contact)
      // GUARD: check if contact notifications are enabled
      if (ticket.requester?.email && ticket.requesterId) {
        const enabled = await isContactNotificationEnabled(ticket.requesterId);
        if (enabled) {
          await sendEmail(ticket.requester.email, subject, html);
        }
      }
    } else {
      // Requester replied -> notify assigned agent (always allowed)
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
        assignee: {
          select: { email: true, firstName: true, lastName: true },
        },
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

    // notifyTicketCreated only emails agents (assignee), no contact guard needed
    await sendEmail(ticket.assignee.email, subject, html);
  } catch (err) {
    console.error("[notifyTicketCreated] Erreur :", err);
  }
}
