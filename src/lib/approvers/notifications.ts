// ============================================================================
// Notifications d'approbation — envoi du courriel initial + relance aux
// approbateurs (tous des contacts côté client) quand un ticket requiert
// une décision.
//
// Utilise le template Nexus-branded partagé (buildNexusEmail) + gate
// l'envoi via l'allowlist dev-safety puisque les approbateurs sont des
// contacts externes (pas des agents Cetix).
// ============================================================================

import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { buildNexusEmail } from "@/lib/email/nexus-template";
import { isAllowedContactEmail } from "@/lib/notifications/allowlist";
import { getPortalTicketUrl, getPortalBaseUrl } from "@/lib/portal-domain/url";

export async function notifyApprovalRequest(ticketId: string): Promise<{
  sent: number;
  failures: number;
  skipped: number;
  total: number;
}> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      number: true,
      subject: true,
      description: true,
      descriptionHtml: true,
      priority: true,
      isInternal: true,
      organization: { select: { name: true } },
      requester: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!ticket) return { sent: 0, failures: 0, skipped: 0, total: 0 };

  const pending = await prisma.ticketApproval.findMany({
    where: { ticketId, status: "PENDING" },
    select: { id: true, approverEmail: true, approverName: true },
  });
  if (pending.length === 0) return { sent: 0, failures: 0, skipped: 0, total: 0 };

  const { getClientTicketPrefix, formatTicketNumber } = await import(
    "@/lib/tenant-settings/service"
  );
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
  const portalUrl = await getPortalTicketUrl(ticket.id);
  const prefsUrl = `${await getPortalBaseUrl()}/account?tab=notifications`;

  // Description en HTML riche si dispo — sinon fallback plain text.
  let richDescription: string | null = null;
  if (ticket.descriptionHtml && ticket.descriptionHtml.trim()) {
    try {
      const { sanitizeEmailHtml } = await import("@/lib/email-to-ticket/html");
      richDescription = sanitizeEmailHtml(ticket.descriptionHtml);
    } catch {
      /* fallback to excerpt below */
    }
  }
  const excerpt = (ticket.description || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);

  const subject = `Approbation requise — ${displayNumber} ${ticket.subject}`;
  let sent = 0;
  let failures = 0;
  let skipped = 0;

  for (const a of pending) {
    if (!a.approverEmail) {
      failures++;
      continue;
    }
    // Garde dev-safety : un contact externe ne reçoit un courriel que
    // s'il est dans l'allowlist (ou si le guard est désactivé en prod).
    const allowed = await isAllowedContactEmail(a.approverEmail);
    if (!allowed) {
      console.info(
        `[approvals] email bloqué par allowlist : ${a.approverEmail} (ticket ${displayNumber})`,
      );
      skipped++;
      continue;
    }

    const html = buildNexusEmail({
      event: "ticket_collaborator_added", // accent violet proche "collaboration"
      preheader: `Décision d'approbation requise pour ${displayNumber}`,
      title: "Une approbation vous est demandée",
      intro: `${a.approverName ? `Bonjour ${a.approverName}, un` : "Un"} ticket attend votre décision pour être pris en charge.`,
      metadata: [
        { label: "Référence", value: displayNumber },
        { label: "Sujet", value: ticket.subject },
        { label: "Organisation", value: orgName },
        { label: "Demandeur", value: requesterName },
        { label: "Priorité", value: ticket.priority.toLowerCase() },
      ],
      quote: richDescription
        ? { author: "Détails de la demande", contentHtml: richDescription }
        : excerpt
          ? { author: "Détails de la demande", content: excerpt + (excerpt.length === 400 ? "…" : "") }
          : undefined,
      ctaUrl: portalUrl,
      ctaLabel: "Voir et décider",
      prefsUrl,
    });
    const ok = await sendEmail(a.approverEmail, subject, html);
    if (ok) sent++;
    else failures++;
  }

  return { sent, failures, skipped, total: pending.length };
}

/**
 * Notification aux agents (demandeur + créateur + collaborateurs) quand
 * un approbateur prend sa décision. Émise côté route PATCH
 * /api/v1/tickets/[id]/approvals/[approvalId]. Passe par le dispatcher
 * central donc respecte les préférences "ticket_approval_decided".
 */
export async function notifyApprovalDecided(opts: {
  ticketId: string;
  decision: "APPROVED" | "REJECTED";
  approverName: string;
  comment?: string | null;
}): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: opts.ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        isInternal: true,
        assigneeId: true,
        creatorId: true,
        collaborators: { select: { userId: true } },
        organization: { select: { name: true } },
      },
    });
    if (!ticket) return;
    const { notifyUsers } = await import("@/lib/notifications/notify");
    const { getClientTicketPrefix, formatTicketNumber } = await import(
      "@/lib/tenant-settings/service"
    );
    const clientPrefix = await getClientTicketPrefix();
    const displayNumber = formatTicketNumber(
      ticket.number,
      !!ticket.isInternal,
      clientPrefix,
    );
    const { getAgentTicketUrl } = await import("@/lib/portal-domain/url");
    const agentUrl = await getAgentTicketUrl(ticket.id);
    const approved = opts.decision === "APPROVED";

    const recipients = new Set<string>();
    if (ticket.assigneeId) recipients.add(ticket.assigneeId);
    if (ticket.creatorId) recipients.add(ticket.creatorId);
    for (const c of ticket.collaborators) recipients.add(c.userId);

    await notifyUsers(Array.from(recipients), "ticket_approval_decided", {
      title: approved
        ? `Approbation accordée : ${ticket.subject}`
        : `Approbation refusée : ${ticket.subject}`,
      body: `${displayNumber} · ${opts.approverName} a ${approved ? "approuvé" : "rejeté"}${opts.comment ? ` — ${opts.comment.slice(0, 80)}` : ""}`,
      link: `/tickets/${ticket.id}`,
      metadata: { ticketId: ticket.id, decision: opts.decision },
      emailSubject: `[${displayNumber}] ${approved ? "Approuvé" : "Rejeté"} par ${opts.approverName}`,
      email: {
        title: approved ? "Approbation accordée" : "Approbation refusée",
        intro: `${displayNumber} — ${ticket.subject}`,
        metadata: [
          { label: "Décision", value: approved ? "Approuvé" : "Rejeté" },
          { label: "Approbateur", value: opts.approverName },
          { label: "Organisation", value: ticket.organization?.name ?? "—" },
        ],
        quote: opts.comment ? { author: opts.approverName, content: opts.comment } : undefined,
        ctaUrl: agentUrl,
        ctaLabel: "Ouvrir le ticket",
      },
    });
  } catch (err) {
    console.error("[notifyApprovalDecided] erreur :", err);
  }
}
