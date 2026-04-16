// ============================================================================
// NOTIFICATION DISPATCHER — orchestre les notifications (in-app + email) sur
// les événements clés des tickets.
//
// Règles de sécurité (garde anti-accidents en développement) :
// - AGENTS (User model) : toujours notifiés, jamais gated par l'allowlist.
//   Ce sont des employés Cetix, accident nul si on leur envoie un courriel.
// - CONTACTS (Contact model, clients externes) : gated par allowlist (voir
//   `src/lib/notifications/allowlist.ts`). En dev, seuls les emails whitelist
//   reçoivent. En prod, l'admin désactive le guard.
//
// Ne throw jamais — les notifications sont fire-and-forget. Les erreurs
// sont loggées et le ticket reste créé normalement.
// ============================================================================

import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { buildBrandedEmailHtml } from "@/lib/email/branded-template";
import { isAllowedContactEmail } from "./allowlist";
import { getPortalTicketUrl, getAgentTicketUrl } from "@/lib/portal-domain/url";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "#EF4444",
  HIGH: "#F97316",
  MEDIUM: "#EAB308",
  LOW: "#22C55E",
};

// ----------------------------------------------------------------------------
// TICKET CREATED — notifie les agents (non assigné → tous, sinon → assigné)
// et le contact demandeur (via garde allowlist).
// ----------------------------------------------------------------------------

export async function dispatchTicketCreatedNotifications(ticketId: string): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        description: true,
        priority: true,
        isInternal: true,
        assigneeId: true,
        creatorId: true,
        requester: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            isActive: true,
          },
        },
        assignee: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        organization: { select: { name: true } },
      },
    });
    if (!ticket) return;

    const clientPrefix = await getClientTicketPrefix();
    const displayNumber = formatTicketNumber(
      ticket.number,
      !!ticket.isInternal,
      clientPrefix,
    );
    const requesterName = ticket.requester
      ? `${ticket.requester.firstName} ${ticket.requester.lastName}`.trim()
      : "—";
    const orgName = ticket.organization?.name ?? "—";
    const priorityColor = PRIORITY_COLORS[ticket.priority] ?? "#6B7280";

    // ------------------------------------------------------------------------
    // 1. AGENTS — notification email + in-app
    // ------------------------------------------------------------------------
    // Si assignee défini → seulement lui. Sinon → tous les agents actifs
    // (TECHNICIAN, SUPERVISOR, MSP_ADMIN, SUPER_ADMIN). On exclut l'auteur
    // de l'action (creatorId) pour ne pas lui notifier sa propre création.
    const agents = ticket.assigneeId
      ? ticket.assignee
        ? [
            {
              id: ticket.assignee.id,
              email: ticket.assignee.email,
              firstName: ticket.assignee.firstName,
              lastName: ticket.assignee.lastName,
            },
          ]
        : []
      : await prisma.user.findMany({
          where: {
            isActive: true,
            role: {
              in: ["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR", "TECHNICIAN"],
            },
            // Jamais au compte technique d'import FS
            email: { not: "freshservice-import@cetix.ca" },
            ...(ticket.creatorId ? { id: { not: ticket.creatorId } } : {}),
          },
          select: { id: true, email: true, firstName: true, lastName: true },
        });

    if (agents.length > 0) {
      const agentUrl = await getAgentTicketUrl(ticket.id);
      const kind = ticket.assigneeId ? "Nouveau billet assigné" : "Nouveau billet à prendre en charge";
      const emailHtml = buildBrandedEmailHtml({
        headerGradient: "linear-gradient(135deg,#059669 0%,#10B981 100%)",
        preheader: `${kind} — ${ticket.subject}`,
        title: `${displayNumber} — ${escapeHtml(ticket.subject)}`,
        subtitle: kind,
        bodyHtml: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:20px;">
            <tr>
              <td style="padding:14px 18px;border-right:1px solid #E2E8F0;" width="33%">
                <p style="margin:0;font-size:11px;color:#94A3B8;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Demandeur</p>
                <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#1E293B;">${escapeHtml(requesterName)}</p>
              </td>
              <td style="padding:14px 18px;border-right:1px solid #E2E8F0;" width="33%">
                <p style="margin:0;font-size:11px;color:#94A3B8;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Organisation</p>
                <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#1E293B;">${escapeHtml(orgName)}</p>
              </td>
              <td style="padding:14px 18px;" width="33%">
                <p style="margin:0;font-size:11px;color:#94A3B8;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Priorité</p>
                <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:${priorityColor};">${ticket.priority.toLowerCase()}</p>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;">Description</p>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;font-size:14px;color:#334155;line-height:1.65;white-space:pre-wrap;margin-bottom:24px;">${escapeHtml(stripHtml(ticket.description).slice(0, 500))}${stripHtml(ticket.description).length > 500 ? "…" : ""}</div>
        `,
        ctaUrl: agentUrl,
        ctaLabel: "Ouvrir le billet",
        ctaColor: "#059669",
      });
      const emailSubject = `[${displayNumber}] ${ticket.subject}`;

      // En parallèle : in-app pour chaque agent, email pour chaque agent
      // qui en a un. Pas de `Promise.all` pour éviter qu'un agent sans
      // email fasse planter le lot ; on boucle et on swallow.
      await prisma.notification.createMany({
        data: agents.map((a) => ({
          userId: a.id,
          type: ticket.assigneeId ? "ticket_assigned" : "ticket_unassigned",
          title: ticket.assigneeId
            ? `Nouveau billet assigné : ${ticket.subject}`
            : `Nouveau billet à prendre en charge : ${ticket.subject}`,
          body: `${displayNumber} · ${orgName} · Priorité ${ticket.priority.toLowerCase()}`,
          link: `/tickets/${ticket.id}`,
          metadata: { ticketId: ticket.id, ticketNumber: ticket.number },
        })),
      });

      for (const a of agents) {
        if (!a.email) continue;
        sendEmail(a.email, emailSubject, emailHtml).catch((e) =>
          console.warn("[dispatch] agent email failed", a.email, e),
        );
      }
    }

    // ------------------------------------------------------------------------
    // 2. CONTACT DEMANDEUR — confirmation avec lien portail direct
    // ------------------------------------------------------------------------
    // Garde stricte : contact actif + email présent + allowlist.
    // Un ticket interne (isInternal=true) n'envoie PAS de confirmation au
    // contact — c'est un ticket interne Cetix, pas une demande client.
    if (!ticket.isInternal && ticket.requester?.email && ticket.requester.isActive) {
      const contactEmail = ticket.requester.email.trim().toLowerCase();
      const allowed = await isAllowedContactEmail(contactEmail);
      if (allowed) {
        const portalUrl = await getPortalTicketUrl(ticket.id);
        const contactSubject = `Confirmation — ${displayNumber} ${ticket.subject}`;
        const contactHtml = buildBrandedEmailHtml({
          headerGradient: "linear-gradient(135deg,#1E40AF 0%,#3B82F6 100%)",
          preheader: `Votre demande ${displayNumber} a bien été reçue`,
          title: "Votre demande a été enregistrée",
          subtitle: `Référence ${displayNumber}`,
          bodyHtml: `
            <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.65;">
              Bonjour ${escapeHtml(requesterName)},
            </p>
            <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.65;">
              Nous avons bien reçu votre demande et elle a été enregistrée sous la référence
              <strong>${escapeHtml(displayNumber)}</strong>. Un membre de notre équipe la prendra en charge dans les meilleurs délais.
            </p>
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 20px;margin:20px 0;">
              <p style="margin:0 0 6px;font-size:11px;color:#94A3B8;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Sujet</p>
              <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1E293B;">${escapeHtml(ticket.subject)}</p>
              <p style="margin:0 0 6px;font-size:11px;color:#94A3B8;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Priorité</p>
              <p style="margin:0;font-size:13px;font-weight:700;color:${priorityColor};">${ticket.priority.toLowerCase()}</p>
            </div>
            <p style="margin:16px 0 0;font-size:13px;color:#64748B;line-height:1.65;">
              Vous pouvez consulter l'avancement de votre demande et échanger avec notre équipe directement via le portail ci-dessous.
            </p>
          `,
          ctaUrl: portalUrl,
          ctaLabel: "Voir ma demande",
          ctaColor: "#2563EB",
        });

        sendEmail(contactEmail, contactSubject, contactHtml).catch((e) =>
          console.warn("[dispatch] contact email failed", contactEmail, e),
        );
      } else {
        console.info(
          `[dispatch] contact email bloqué par allowlist : ${contactEmail} (ticket ${displayNumber})`,
        );
      }
    }
  } catch (err) {
    console.error("[dispatchTicketCreatedNotifications] erreur :", err);
  }
}

// ----------------------------------------------------------------------------
// Helper utilitaire public : créer une notification in-app simple. Utile
// pour les autres flux (commentaires, changements de statut…) qui veulent
// juste pousser dans la cloche.
// ----------------------------------------------------------------------------

export async function createInAppNotification(opts: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        link: opts.link,
        metadata: opts.metadata as any,
      },
    });
  } catch (err) {
    console.warn("[createInAppNotification] erreur :", err);
  }
}
