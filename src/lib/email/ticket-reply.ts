// ============================================================================
// Ticket replies omnicanal : un commentaire PUBLIC créé dans Nexus part
// aussi par courriel au demandeur avec un threading MIME correct. Les
// replies du client (par courriel OU depuis le portail) se rattachent au
// même ticket.
//
// Design inspiré de Freshservice :
//   - Subject formaté "[TK-1042] Sujet du ticket"  → threading stable
//   - Message-ID stocké dans Comment.messageId
//   - In-Reply-To pointe vers le dernier Comment messageId de la chaîne
//   - Reply-To pointe vers l'adresse d'ingestion (billets@cetix.ca) pour
//     que le client puisse répondre par courriel et retomber ici.
// ============================================================================

import prisma from "@/lib/prisma";
import { sendEmailWithMeta } from "@/lib/email/send";
import { sanitizeEmailHtml, plainTextToHtml, htmlToPlainText } from "@/lib/email-to-ticket/html";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";

/**
 * Génère un Message-ID stable pour un Comment sortant. On inclut le
 * ticket.id et comment.id pour garder une piste de retour lisible dans
 * les en-têtes — utile au debug.
 */
function generateMessageId(ticketId: string, commentId: string, mailbox: string): string {
  const domain = mailbox.includes("@") ? mailbox.split("@")[1] : "nexus.local";
  return `<nexus-${ticketId}-${commentId}-${Date.now()}@${domain}>`;
}

/**
 * Construit le corps HTML de l'email sortant : le commentaire de l'agent
 * + un petit footer "Ticket TK-1042 · https://.../portal/tickets/..." pour
 * que le client ait toujours le numéro et un lien d'accès rapide.
 */
function buildReplyHtml(args: {
  agentName: string;
  bodyHtml: string;
  ticketDisplayNumber: string;
  portalUrl: string | null;
}): string {
  const header = `
    <div style="margin-bottom:16px;padding:12px 14px;border-left:3px solid #2563eb;background:#f8fafc;color:#334155;font-size:13px;">
      <strong>${escapeHtml(args.agentName)}</strong> a répondu à votre ticket
      <strong>${escapeHtml(args.ticketDisplayNumber)}</strong> :
    </div>`;
  const footer = args.portalUrl
    ? `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
         Vous pouvez répondre à ce courriel pour ajouter votre réponse au ticket,
         ou consulter le ticket dans le portail :
         <a href="${args.portalUrl}" style="color:#2563eb;text-decoration:underline;">${args.portalUrl}</a>
       </div>`
    : `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
         Vous pouvez répondre à ce courriel pour ajouter votre réponse directement au ticket.
       </div>`;
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;font-size:14px;line-height:1.5;">
    ${header}
    <div>${args.bodyHtml}</div>
    ${footer}
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Envoie le commentaire public au demandeur et met à jour Comment en DB
 * avec le messageId effectivement émis + emailSent=true. No-op si le
 * commentaire est interne, si le demandeur n'a pas de courriel, ou si
 * SMTP n'est pas configuré (log + return).
 *
 * Idempotent : si emailSent est déjà true, ne renvoie pas.
 */
export async function sendTicketReplyEmail(commentId: string): Promise<{
  ok: boolean;
  skipped?: string;
  messageId?: string;
  error?: string;
}> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      author: { select: { firstName: true, lastName: true, email: true } },
      ticket: {
        select: {
          id: true,
          number: true,
          subject: true,
          isInternal: true,
          requester: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });
  if (!comment) return { ok: false, error: "Comment not found" };
  if (comment.isInternal) return { ok: false, skipped: "internal" };
  if (comment.emailSent) return { ok: false, skipped: "already-sent" };
  if (!comment.ticket.requester?.email) return { ok: false, skipped: "no-requester-email" };

  // Garde dev-safety : le demandeur est un contact externe. On ne lui
  // envoie le courriel que s'il est dans l'allowlist (ou si le guard
  // est désactivé en production). Évite les fuites vers de vrais
  // clients pendant la cohabitation avec Freshservice.
  const { isAllowedContactEmail } = await import("@/lib/notifications/allowlist");
  const contactEmail = comment.ticket.requester.email.trim().toLowerCase();
  const allowed = await isAllowedContactEmail(contactEmail);
  if (!allowed) {
    console.info(
      `[ticket-reply] email bloqué par allowlist : ${contactEmail} (comment ${commentId})`,
    );
    // On marque quand même emailSent=true pour ne pas bloquer le
    // ticket dans un état "en attente d'envoi" qui réessaierait à
    // chaque ingestion. L'admin peut vérifier dans Paramètres
    // → Notifications quels emails sont autorisés.
    await prisma.comment.update({
      where: { id: comment.id },
      data: { emailSent: true, emailSentAt: new Date() },
    });
    return { ok: false, skipped: "allowlist" };
  }

  const { ticket, author, ticket: { requester } } = comment;

  // Numéro affiché : préfixe selon org (TK-/INT-).
  const clientPrefix = await getClientTicketPrefix();
  const displayNumber = formatTicketNumber(
    ticket.number,
    !!ticket.isInternal,
    clientPrefix,
  );

  // Sujet stable pour le threading Freshservice-style :
  //   "[TK-1042] <sujet d'origine>"
  // On détecte si le sujet contient déjà le tag pour ne pas le dupliquer.
  const subject = ticket.subject.includes(`[${displayNumber}]`)
    ? `Re: ${ticket.subject}`
    : `Re: [${displayNumber}] ${ticket.subject}`;

  // Body HTML : le commentaire sanitizé + header/footer Nexus.
  const bodyHtml = comment.bodyHtml
    ? sanitizeEmailHtml(comment.bodyHtml)
    : plainTextToHtml(comment.body);
  const agentName = `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || "Nexus";

  // URL portail (optionnelle — si PUBLIC_BASE_URL est configuré).
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.PORTAL_BASE_URL || "";
  const portalUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/portal/tickets/${ticket.id}` : null;

  const html = buildReplyHtml({
    agentName,
    bodyHtml,
    ticketDisplayNumber: displayNumber,
    portalUrl,
  });
  const text = htmlToPlainText(html);

  // Threading : In-Reply-To = dernier message de la chaîne. On cherche
  // le Comment le plus récent AVANT celui-ci qui a un messageId (soit
  // un courriel entrant, soit une réponse sortante déjà envoyée).
  const previous = await prisma.comment.findFirst({
    where: {
      ticketId: ticket.id,
      id: { not: comment.id },
      messageId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { messageId: true },
  });
  // Chaîne References : tous les messageIds de la conversation.
  const allRefs = await prisma.comment.findMany({
    where: {
      ticketId: ticket.id,
      id: { not: comment.id },
      messageId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { messageId: true },
  });

  // Détermine From/Reply-To :
  //   - Reply-To = la boîte d'ingestion pour que le client puisse
  //     répondre et retomber dans le pipeline.
  //   - From = la même adresse pour que les clients voient une
  //     conversation cohérente (pas "notifications@...").
  const inbound = await prisma.tenantSetting.findUnique({
    where: { key: "email-to-ticket" },
  });
  const inboundMailbox = (inbound?.value as { mailbox?: string } | null)?.mailbox;

  // Génère le messageId AVANT l'envoi pour le stocker en DB identique.
  const mailbox = inboundMailbox || "nexus@localhost";
  const messageId = generateMessageId(ticket.id, comment.id, mailbox);

  const result = await sendEmailWithMeta(requester.email, subject, html, {
    text,
    messageId,
    inReplyTo: previous?.messageId ?? undefined,
    references: allRefs.map((c) => c.messageId!).filter(Boolean),
    replyTo: inboundMailbox,
    from: inboundMailbox ? { email: inboundMailbox, name: "Cetix · Support" } : undefined,
    extraHeaders: {
      "X-Nexus-Ticket-Id": ticket.id,
      "X-Nexus-Ticket-Number": displayNumber,
    },
  });

  if (result.ok) {
    await prisma.comment.update({
      where: { id: comment.id },
      data: {
        messageId: result.messageId ?? messageId,
        inReplyToMessageId: previous?.messageId ?? null,
        emailSent: true,
        emailSentAt: new Date(),
      },
    });
  }
  return result;
}
