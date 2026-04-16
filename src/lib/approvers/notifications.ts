// ============================================================================
// Notifications d'approbation — envoi du courriel initial aux approbateurs
// quand un ticket est créé avec `requiresApproval=true`.
//
// La logique de relance (bouton « Relancer ») vit dans
// /api/v1/tickets/[id]/approvals/resend — on garde une implémentation
// séparée pour distinguer la première demande (subject "Approbation
// demandée") de la relance (subject "Relance — ...").
// ============================================================================

import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyApprovalRequest(ticketId: string): Promise<{
  sent: number;
  failures: number;
  total: number;
}> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      number: true,
      subject: true,
      description: true,
      isInternal: true,
      organization: { select: { name: true } },
      requester: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!ticket) return { sent: 0, failures: 0, total: 0 };

  const pending = await prisma.ticketApproval.findMany({
    where: { ticketId, status: "PENDING" },
    select: { id: true, approverEmail: true, approverName: true },
  });
  if (pending.length === 0) return { sent: 0, failures: 0, total: 0 };

  const { getClientTicketPrefix, formatTicketNumber } = await import(
    "@/lib/tenant-settings/service"
  );
  const clientPrefix = await getClientTicketPrefix();
  const ticketNumber = formatTicketNumber(
    ticket.number,
    !!ticket.isInternal,
    clientPrefix,
  );
  const requesterName = ticket.requester
    ? `${ticket.requester.firstName} ${ticket.requester.lastName}`.trim()
    : "—";
  const orgName = ticket.organization?.name ?? "—";
  const appUrl = process.env.NEXTAUTH_URL ?? "";

  const subject = `Approbation demandée : ${ticket.subject}`;
  let sent = 0;
  let failures = 0;

  for (const a of pending) {
    if (!a.approverEmail) {
      failures++;
      continue;
    }
    // Extrait court de la description (plain-text, sans HTML), max
    // 300 caractères — donne le contexte au décideur sans remplir
    // tout le courriel.
    const excerpt = (ticket.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0f172a;max-width:560px;">
        <p style="font-size:15px;">Bonjour ${escapeHtml(a.approverName || "")},</p>
        <p>Une demande d'approbation requiert votre décision :</p>
        <div style="border-left:3px solid #2563eb;padding:12px 16px;background:#eff6ff;border-radius:0 6px 6px 0;margin:16px 0;">
          <p style="margin:0;font-weight:600;font-size:15px;">${escapeHtml(ticket.subject)}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#475569;">
            ${escapeHtml(ticketNumber)} · ${escapeHtml(orgName)} · Demandé par ${escapeHtml(requesterName)}
          </p>
          ${excerpt ? `<p style="margin:10px 0 0;font-size:13px;color:#334155;">${escapeHtml(excerpt)}${ticket.description && ticket.description.length > 300 ? "…" : ""}</p>` : ""}
        </div>
        <p style="margin:20px 0;">
          <a href="${appUrl}/portal/tickets/${ticket.id}"
             style="display:inline-block;background:#2563eb;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500;">
             Voir et décider
          </a>
        </p>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px;">
          Le ticket restera bloqué tant qu'un ou plusieurs approbateurs n'auront
          pas validé la demande. Vous pouvez approuver ou rejeter directement
          depuis le portail client.
        </p>
      </div>
    `;
    const ok = await sendEmail(a.approverEmail, subject, html);
    if (ok) sent++;
    else failures++;
  }

  return { sent, failures, total: pending.length };
}
