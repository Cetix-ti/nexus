// ============================================================================
// PAYLOAD BUILDERS pour les events ticket_*
//
// Ces helpers transforment les rows DB en objets `{key: value}` consommés
// par `renderTemplateForEvent`. Garantissent que toutes les variables
// documentées dans `variable-catalog.ts` sont effectivement fournies au
// moment du dispatch — sinon l'admin a beau les utiliser dans un template,
// elles seraient remplacées par "" en silence.
//
// Usage typique côté dispatcher :
//   const payload = await buildTicketPayload(ticket, { actorName, ... });
//   await notifyUser(userId, "ticket_assigned", { ..., emailPayload: payload });
// ============================================================================

import prisma from "@/lib/prisma";
import { getAgentTicketUrl } from "@/lib/portal-domain/url";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";

const PRIORITY_EMOJI: Record<string, string> = {
  CRITICAL: "🔴",
  URGENT: "🔴",
  HIGH: "🟠",
  MEDIUM: "🟡",
  LOW: "🟢",
};

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: "Critique",
  URGENT: "Urgente",
  HIGH: "Élevée",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nouveau",
  OPEN: "Ouvert",
  IN_PROGRESS: "En cours",
  ON_SITE: "Sur place",
  WAITING_CLIENT: "Attente client",
  PENDING: "En attente",
  RESOLVED: "Résolu",
  CLOSED: "Fermé",
  CANCELLED: "Annulé",
};

function fmtDateFr(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" });
}

function commonPayload(): Record<string, string> {
  const appUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://nexus.cetix.ca";
  return {
    app_url: appUrl,
    company_name: process.env.COMPANY_NAME ?? "Cetix Informatique",
    now: new Date().toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" }),
  };
}

export interface TicketPayloadExtras {
  actorName?: string;
  previousStatus?: string;
  commentExcerpt?: string;
  commentIsInternal?: boolean;
  reminderMessage?: string;
  approvalDecision?: "APPROVED" | "REJECTED";
  approvalNote?: string;
  replyExcerpt?: string;
}

/**
 * Construit le payload complet pour un event ticket. Charge en DB les
 * champs nécessaires si pas déjà présents.
 */
export async function buildTicketPayload(
  ticketId: string,
  extras: TicketPayloadExtras = {},
): Promise<Record<string, string>> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      assignee: { select: { firstName: true, lastName: true, email: true } },
      requester: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!ticket) return commonPayload();

  const clientPrefix = await getClientTicketPrefix();
  const displayNumber = formatTicketNumber(ticket.number, !!ticket.isInternal, clientPrefix);
  const agentUrl = await getAgentTicketUrl(displayNumber);

  const slaState = ticket.isOverdue
    ? "breach"
    : ticket.dueAt && ticket.dueAt.getTime() - Date.now() < 4 * 3600_000
      ? "risque"
      : "à temps";

  const excerpt = (ticket.description || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  const orgUrl = ticket.organization?.slug
    ? `${commonPayload().app_url}/organisations/${ticket.organization.slug}`
    : "";

  return {
    ...commonPayload(),
    // Ticket
    ticket_number: String(ticket.number),
    ticket_display_number: displayNumber,
    ticket_subject: ticket.subject,
    ticket_priority: ticket.priority,
    ticket_priority_label: PRIORITY_LABEL[ticket.priority] ?? ticket.priority,
    ticket_priority_emoji: PRIORITY_EMOJI[ticket.priority] ?? "",
    ticket_status: ticket.status,
    ticket_status_label: STATUS_LABEL[ticket.status] ?? ticket.status,
    ticket_url: agentUrl,
    ticket_description_excerpt: excerpt + (excerpt.length >= 300 ? "…" : ""),
    ticket_created_at: fmtDateFr(ticket.createdAt),
    ticket_sla_deadline: fmtDateFr(ticket.dueAt),
    ticket_sla_state: slaState,
    // Org
    org_id: ticket.organization?.id ?? "",
    org_name: ticket.organization?.name ?? "—",
    org_url: orgUrl,
    // People
    assignee_name: ticket.assignee
      ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`.trim()
      : "—",
    assignee_email: ticket.assignee?.email ?? "",
    requester_name: ticket.requester
      ? `${ticket.requester.firstName} ${ticket.requester.lastName}`.trim()
      : "—",
    requester_email: ticket.requester?.email ?? "",
    actor_name: extras.actorName ?? "",
    // Event-specific extras (rendus disponibles même s'ils ne sont pas
    // toujours pertinents — `{{previous_status_label}}` retourne "" si le
    // dispatcher ne l'a pas fourni, ce qui est OK).
    previous_status_label: extras.previousStatus
      ? STATUS_LABEL[extras.previousStatus] ?? extras.previousStatus
      : "",
    comment_excerpt: extras.commentExcerpt ?? "",
    comment_is_internal: extras.commentIsInternal ? "true" : "false",
    reminder_message: extras.reminderMessage ?? "",
    approval_decision: extras.approvalDecision ?? "",
    approval_decision_label:
      extras.approvalDecision === "APPROVED" ? "Approuvé"
      : extras.approvalDecision === "REJECTED" ? "Rejeté"
      : "",
    approval_note: extras.approvalNote ?? "",
    reply_excerpt: extras.replyExcerpt ?? "",
  };
}

/** Pour les events qui n'ont pas de ticket (project, monitoring, renewal, weekly_digest, bug). */
export function buildBasicPayload(extra: Record<string, string | number | null | undefined>): Record<string, string> {
  const out: Record<string, string> = { ...commonPayload() };
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined) out[k] = String(v);
  }
  return out;
}
