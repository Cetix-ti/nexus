// ============================================================================
// NOTIFICATION DISPATCHERS BY EVENT
//
// Une fonction par événement métier. Chaque fonction :
//   1. récupère les données nécessaires depuis la DB (ticket, projet, etc.)
//   2. détermine les destinataires (assignee, collaborateurs, créateur, tous
//      les agents, etc.)
//   3. construit le contenu (title, email) et appelle notifyUser/notifyUsers
//
// Les appelants (service de création/update de ticket, hook de comment, etc.)
// se contentent d'appeler la fonction dédiée — ils n'ont pas à gérer les
// préférences, les emails, ni les canaux.
//
// Règles d'anti-accident :
//   - Les contacts externes (Contact) ne passent PAS par ici ; ils sont gated
//     par l'allowlist (cf. src/lib/notifications/allowlist.ts) et envoyés
//     via leur propre code (dispatchTicketCreatedNotifications garde l'accès
//     contact pour ne pas casser la chaîne existante).
//   - L'auteur d'une action (creatorId, commenter, agent qui fait le change)
//     est exclu pour éviter les self-notifs.
// ============================================================================

import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { buildNexusEmail } from "@/lib/email/nexus-template";
import { isAllowedContactEmail } from "./allowlist";
import { getPortalTicketUrl, getAgentTicketUrl } from "@/lib/portal-domain/url";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";
import { notifyUser, notifyUsers, type NotifyContent } from "./notify";

// ----------------------------------------------------------------------------
// Helpers internes
// ----------------------------------------------------------------------------

async function formatTicketDisplay(ticket: {
  number: number;
  isInternal: boolean | null;
}): Promise<string> {
  const prefix = await getClientTicketPrefix();
  return formatTicketNumber(ticket.number, !!ticket.isInternal, prefix);
}

async function listActiveAgents(excludeId?: string | null): Promise<string[]> {
  const agents = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR", "TECHNICIAN"] },
      email: { not: "freshservice-import@cetix.ca" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return agents.map((a) => a.id);
}

function ticketMetadata(ticket: {
  requester?: { firstName: string; lastName: string } | null;
  organization?: { name: string } | null;
  priority: string;
}): { label: string; value: string }[] {
  const meta: { label: string; value: string }[] = [];
  if (ticket.requester) {
    meta.push({
      label: "Demandeur",
      value: `${ticket.requester.firstName} ${ticket.requester.lastName}`.trim(),
    });
  }
  if (ticket.organization?.name) {
    meta.push({ label: "Organisation", value: ticket.organization.name });
  }
  meta.push({ label: "Priorité", value: ticket.priority.toLowerCase() });
  return meta;
}

// ============================================================================
// TICKET CREATED
// ============================================================================

export async function dispatchTicketCreatedNotifications(ticketId: string): Promise<void> {
  try {
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
        assigneeId: true,
        creatorId: true,
        requester: {
          select: { firstName: true, lastName: true, email: true, isActive: true },
        },
        assignee: { select: { id: true } },
        organization: { select: { name: true } },
      },
    });
    if (!ticket) return;

    const displayNumber = await formatTicketDisplay(ticket);
    const agentUrl = await getAgentTicketUrl(ticket.id);
    const portalUrl = await getPortalTicketUrl(ticket.id);
    // HTML riche de la description si dispo — préserve gras, listes,
    // images inline (cid: réécrits en URLs MinIO par le pipeline
    // email-to-ticket). Si absent, on retombe sur un extrait plain text.
    let richDescription: string | null = null;
    if (ticket.descriptionHtml && ticket.descriptionHtml.trim()) {
      try {
        const { sanitizeEmailHtml } = await import("@/lib/email-to-ticket/html");
        richDescription = sanitizeEmailHtml(ticket.descriptionHtml);
      } catch (e) {
        console.warn("[dispatchTicketCreatedNotifications] HTML sanitize échoué :", e);
      }
    }
    const excerpt = (ticket.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);

    // --- Destinataires agents -----------------------------------------
    const event = ticket.assigneeId ? "ticket_assigned" : "ticket_unassigned_pool";
    const recipients = ticket.assigneeId
      ? [ticket.assigneeId]
      : await listActiveAgents(ticket.creatorId);

    const content: NotifyContent = {
      title: ticket.assigneeId
        ? `Ticket assigné : ${ticket.subject}`
        : `Nouveau ticket à prendre en charge : ${ticket.subject}`,
      body: `${displayNumber} · ${ticket.organization?.name ?? "—"} · Priorité ${ticket.priority.toLowerCase()}`,
      link: `/tickets/${ticket.id}`,
      // organizationName dans la metadata → l'UI de notifications (cloche
      // + toast) rend l'OrgLogo à la place de l'icône générique.
      metadata: {
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        organizationName: ticket.organization?.name ?? null,
      },
      emailSubject: `[${displayNumber}] ${ticket.subject}`,
      email: {
        title: ticket.assigneeId ? "Un ticket vous est assigné" : "Nouveau ticket à prendre en charge",
        intro: `${displayNumber} — ${ticket.subject}`,
        metadata: ticketMetadata(ticket),
        // Carte "description" : si HTML riche dispo → on l'affiche dans
        // un quote block pour préserver formattage + images. Sinon,
        // extrait plain text dans le body.
        body: richDescription
          ? undefined
          : excerpt
            ? `<p style="margin:0;">${excerpt}${excerpt.length === 300 ? "…" : ""}</p>`
            : undefined,
        quote: richDescription
          ? {
              author: "Description",
              contentHtml: richDescription,
            }
          : undefined,
        ctaUrl: agentUrl,
        ctaLabel: "Ouvrir le ticket",
      },
    };

    await notifyUsers(recipients, event, content, ticket.creatorId);

    // --- Contact demandeur (courriel seulement, gated allowlist) ------
    if (!ticket.isInternal && ticket.requester?.email && ticket.requester.isActive) {
      const contactEmail = ticket.requester.email.trim().toLowerCase();
      const allowed = await isAllowedContactEmail(contactEmail);
      if (allowed) {
        const html = buildNexusEmail({
          event: "ticket_unassigned_pool",
          title: "Votre demande est bien reçue",
          intro: `Référence ${displayNumber}`,
          metadata: [
            { label: "Sujet", value: ticket.subject },
            { label: "Priorité", value: ticket.priority.toLowerCase() },
          ],
          body: `<p style="margin:0;">Bonjour ${ticket.requester.firstName},</p><p style="margin:12px 0 0;">Nous avons bien enregistré votre demande. Un membre de notre équipe la prendra en charge dans les meilleurs délais et vous pourrez suivre son avancement directement depuis le portail.</p>`,
          ctaUrl: portalUrl,
          ctaLabel: "Voir ma demande",
        });
        sendEmail(contactEmail, `Confirmation — ${displayNumber} ${ticket.subject}`, html).catch(
          (e) => console.warn("[dispatch] contact email failed", e),
        );
      } else {
        console.info(`[dispatch] contact email bloqué par allowlist : ${contactEmail}`);
      }
    }
  } catch (err) {
    console.error("[dispatchTicketCreatedNotifications] erreur :", err);
  }
}

// ============================================================================
// TICKET ASSIGNED — notification au DEMANDEUR que son ticket a été pris
// en charge. Envoyée quand `assigneeId` passe de null → user via un
// updateTicket. Respecte l'allowlist (comme toute notif contact).
// ============================================================================

export async function dispatchTicketTakenOver(
  ticketId: string,
  newAssigneeId: string,
): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        priority: true,
        isInternal: true,
        organization: { select: { name: true } },
        requester: {
          select: { firstName: true, lastName: true, email: true, isActive: true },
        },
      },
    });
    if (!ticket) return;
    // On ne notifie que pour les tickets client — un ticket interne Cetix
    // n'a pas de contact demandeur à informer.
    if (ticket.isInternal) return;
    if (!ticket.requester?.email || !ticket.requester.isActive) return;

    const contactEmail = ticket.requester.email.trim().toLowerCase();
    const allowed = await isAllowedContactEmail(contactEmail);
    if (!allowed) {
      console.info(
        `[dispatch] assignment confirmation bloquée par allowlist : ${contactEmail}`,
      );
      return;
    }

    const assignee = await prisma.user.findUnique({
      where: { id: newAssigneeId },
      select: { firstName: true, lastName: true },
    });
    const assigneeName = assignee
      ? `${assignee.firstName} ${assignee.lastName}`.trim()
      : "notre équipe";

    const displayNumber = await formatTicketDisplay(ticket);
    const portalUrl = await getPortalTicketUrl(ticket.id);

    const html = buildNexusEmail({
      event: "ticket_assigned",
      preheader: `Votre demande ${displayNumber} est prise en charge par ${assigneeName}`,
      title: "Votre demande est prise en charge",
      intro: `Référence ${displayNumber}`,
      metadata: [
        { label: "Sujet", value: ticket.subject },
        { label: "Prise en charge par", value: assigneeName },
        { label: "Priorité", value: ticket.priority.toLowerCase() },
        ...(ticket.organization?.name
          ? [{ label: "Organisation", value: ticket.organization.name }]
          : []),
      ],
      body: `<p style="margin:0;">Bonjour ${ticket.requester.firstName},</p><p style="margin:12px 0 0;">${assigneeName} vient d'être assigné(e) à votre demande et s'en occupe dès maintenant. Vous serez notifié de chaque mise à jour et pourrez suivre le traitement directement depuis le portail.</p>`,
      ctaUrl: portalUrl,
      ctaLabel: "Voir ma demande",
    });

    sendEmail(
      contactEmail,
      `Pris en charge — ${displayNumber} ${ticket.subject}`,
      html,
    ).catch((e) => console.warn("[dispatch] takenover email failed", e));
  } catch (err) {
    console.error("[dispatchTicketTakenOver] erreur :", err);
  }
}

// ============================================================================
// TICKET COLLABORATOR ADDED  (nouveau — demande explicite utilisateur)
// ============================================================================

export async function dispatchCollaboratorAdded(
  ticketId: string,
  addedUserId: string,
  addedByUserId?: string | null,
): Promise<void> {
  try {
    if (addedByUserId === addedUserId) return; // on ne se notifie pas soi-même
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        priority: true,
        isInternal: true,
        assigneeId: true,
        requester: { select: { firstName: true, lastName: true } },
        organization: { select: { name: true } },
      },
    });
    if (!ticket) return;
    const displayNumber = await formatTicketDisplay(ticket);
    const agentUrl = await getAgentTicketUrl(ticket.id);

    let addedByName = "Un agent";
    if (addedByUserId) {
      const u = await prisma.user.findUnique({
        where: { id: addedByUserId },
        select: { firstName: true, lastName: true },
      });
      if (u) addedByName = `${u.firstName} ${u.lastName}`.trim() || addedByName;
    }

    await notifyUser(addedUserId, "ticket_collaborator_added", {
      title: `Vous avez été ajouté comme collaborateur : ${ticket.subject}`,
      body: `${displayNumber} · ${ticket.organization?.name ?? "—"} · par ${addedByName}`,
      link: `/tickets/${ticket.id}`,
      metadata: {
        ticketId: ticket.id,
        addedBy: addedByUserId,
        organizationName: ticket.organization?.name ?? null,
      },
      emailSubject: `[${displayNumber}] Vous avez été ajouté en collaboration`,
      email: {
        title: "Vous avez été ajouté comme collaborateur",
        intro: `${addedByName} vous a ajouté sur le ticket ${displayNumber}.`,
        metadata: [
          { label: "Ticket", value: ticket.subject },
          { label: "Organisation", value: ticket.organization?.name ?? "—" },
          { label: "Priorité", value: ticket.priority.toLowerCase() },
        ],
        ctaUrl: agentUrl,
        ctaLabel: "Ouvrir le ticket",
      },
    });
  } catch (err) {
    console.error("[dispatchCollaboratorAdded] erreur :", err);
  }
}

// ============================================================================
// TICKET STATUS CHANGE
// ============================================================================

export async function dispatchTicketStatusChange(
  ticketId: string,
  oldStatus: string,
  newStatus: string,
  changedByUserId?: string | null,
): Promise<void> {
  try {
    if (oldStatus === newStatus) return;
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        priority: true,
        isInternal: true,
        assigneeId: true,
        creatorId: true,
        organization: { select: { name: true } },
        collaborators: { select: { userId: true } },
      },
    });
    if (!ticket) return;

    // Destinataires = assignee + créateur + collaborateurs (uniques),
    // moins celui qui a fait le changement.
    const recipients = new Set<string>();
    if (ticket.assigneeId) recipients.add(ticket.assigneeId);
    if (ticket.creatorId) recipients.add(ticket.creatorId);
    for (const c of ticket.collaborators) recipients.add(c.userId);
    const displayNumber = await formatTicketDisplay(ticket);
    const agentUrl = await getAgentTicketUrl(ticket.id);

    // Choix d'événement : si statut final → "resolved" dédié (opt-in distinct
    // dans les prefs), sinon changement générique.
    const isResolution = newStatus.toUpperCase() === "RESOLVED";
    const eventKey = isResolution ? "ticket_resolved" : "ticket_status_change";

    await notifyUsers(
      Array.from(recipients),
      eventKey,
      {
        title: isResolution
          ? `Ticket résolu : ${ticket.subject}`
          : `Statut changé : ${ticket.subject}`,
        body: `${displayNumber} · ${oldStatus.toLowerCase()} → ${newStatus.toLowerCase()}`,
        link: `/tickets/${ticket.id}`,
        metadata: {
          ticketId: ticket.id,
          oldStatus,
          newStatus,
          organizationName: ticket.organization?.name ?? null,
        },
        emailSubject: `[${displayNumber}] ${isResolution ? "Résolu" : "Statut mis à jour"}`,
        email: {
          title: isResolution ? "Ticket résolu" : "Statut du ticket mis à jour",
          intro: `${displayNumber} — ${ticket.subject}`,
          metadata: [
            { label: "Ancien statut", value: oldStatus.toLowerCase() },
            { label: "Nouveau statut", value: newStatus.toLowerCase() },
            { label: "Organisation", value: ticket.organization?.name ?? "—" },
          ],
          ctaUrl: agentUrl,
          ctaLabel: "Ouvrir le ticket",
        },
      },
      changedByUserId ?? undefined,
    );
  } catch (err) {
    console.error("[dispatchTicketStatusChange] erreur :", err);
  }
}

// ============================================================================
// TICKET COMMENT  (+ mention si @user détecté)
// ============================================================================

export async function dispatchTicketComment(opts: {
  ticketId: string;
  authorUserId?: string | null;
  /** Plain text — toujours fourni pour preview / notification in-app. */
  commentBody: string;
  /**
   * HTML riche du commentaire tel que saisi (TipTap côté agent, ou HTML
   * préservé des emails entrants). Si fourni, la notification email
   * conservera la mise en forme (gras, listes, images inline…). Sinon
   * on retombe sur le plain text.
   */
  commentBodyHtml?: string | null;
  isInternal: boolean;
  mentionedUserIds?: string[];
}): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: opts.ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        priority: true,
        isInternal: true,
        assigneeId: true,
        creatorId: true,
        organization: { select: { name: true } },
        collaborators: { select: { userId: true } },
      },
    });
    if (!ticket) return;

    const displayNumber = await formatTicketDisplay(ticket);
    const agentUrl = await getAgentTicketUrl(ticket.id);

    let authorName = "Un agent";
    if (opts.authorUserId) {
      const u = await prisma.user.findUnique({
        where: { id: opts.authorUserId },
        select: { firstName: true, lastName: true },
      });
      if (u) authorName = `${u.firstName} ${u.lastName}`.trim() || authorName;
    }

    // Watchers = assignee + créateur + collaborateurs.
    const watchers = new Set<string>();
    if (ticket.assigneeId) watchers.add(ticket.assigneeId);
    if (ticket.creatorId) watchers.add(ticket.creatorId);
    for (const c of ticket.collaborators) watchers.add(c.userId);

    // Mentions : on notifie explicitement avec l'événement "ticket_mention"
    // et on les retire des watchers simples (évite double notif).
    const mentions = new Set(opts.mentionedUserIds ?? []);
    for (const uid of mentions) watchers.delete(uid);

    const excerpt = opts.commentBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    // Préparation du HTML riche pour l'email — on sanitize si l'appelant
    // a fourni bodyHtml, sinon l'email retombe sur l'extrait plain text.
    // Évite de faire confiance à du HTML brut sorti de TipTap / Graph.
    let richHtml: string | null = null;
    if (opts.commentBodyHtml && opts.commentBodyHtml.trim()) {
      try {
        const { sanitizeEmailHtml } = await import("@/lib/email-to-ticket/html");
        richHtml = sanitizeEmailHtml(opts.commentBodyHtml);
      } catch (e) {
        console.warn("[dispatchTicketComment] HTML sanitize échoué :", e);
      }
    }

    const commonContent: Omit<NotifyContent, "title"> = {
      body: `${displayNumber} · ${authorName}${opts.isInternal ? " (note interne)" : ""}`,
      link: `/tickets/${ticket.id}`,
      metadata: {
        ticketId: ticket.id,
        authorUserId: opts.authorUserId ?? null,
        organizationName: ticket.organization?.name ?? null,
      },
      emailSubject: `[${displayNumber}] Nouveau commentaire`,
      email: {
        title: "Nouveau commentaire sur un ticket",
        intro: `${displayNumber} — ${ticket.subject}`,
        metadata: ticketMetadata({
          requester: null,
          organization: ticket.organization,
          priority: ticket.priority,
        }),
        quote: richHtml
          ? { author: authorName, contentHtml: richHtml }
          : excerpt
            ? { author: authorName, content: excerpt + (excerpt.length === 300 ? "…" : "") }
            : undefined,
        ctaUrl: agentUrl,
        ctaLabel: "Voir le commentaire",
      },
    };

    await Promise.allSettled([
      notifyUsers(
        Array.from(mentions),
        "ticket_mention",
        { ...commonContent, title: `${authorName} vous a mentionné sur ${ticket.subject}` },
        opts.authorUserId ?? undefined,
      ),
      notifyUsers(
        Array.from(watchers),
        "ticket_comment",
        { ...commonContent, title: `Nouveau commentaire : ${ticket.subject}` },
        opts.authorUserId ?? undefined,
      ),
    ]);
  } catch (err) {
    console.error("[dispatchTicketComment] erreur :", err);
  }
}

// ============================================================================
// TICKET REMINDER
// ============================================================================

export async function dispatchTicketReminder(
  ticketId: string,
  forUserId: string,
  note?: string,
): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        priority: true,
        isInternal: true,
        organization: { select: { name: true } },
      },
    });
    if (!ticket) return;
    const displayNumber = await formatTicketDisplay(ticket);
    const agentUrl = await getAgentTicketUrl(ticket.id);

    await notifyUser(forUserId, "ticket_reminder", {
      title: `Rappel : ${ticket.subject}`,
      body: `${displayNumber}${note ? ` · ${note}` : ""}`,
      link: `/tickets/${ticket.id}`,
      metadata: {
        ticketId: ticket.id,
        note,
        organizationName: ticket.organization?.name ?? null,
      },
      emailSubject: `[${displayNumber}] Rappel`,
      email: {
        title: "Rappel de ticket",
        intro: `${displayNumber} — ${ticket.subject}`,
        metadata: ticketMetadata({
          requester: null,
          organization: ticket.organization,
          priority: ticket.priority,
        }),
        body: note ? `<p style="margin:0;">${note}</p>` : undefined,
        ctaUrl: agentUrl,
        ctaLabel: "Ouvrir le ticket",
      },
    });
  } catch (err) {
    console.error("[dispatchTicketReminder] erreur :", err);
  }
}

// ============================================================================
// PROJECT ASSIGNED / STATUS CHANGE  (client + interne)
// ============================================================================

export async function dispatchProjectAssigned(
  projectId: string,
  userId: string,
  assignedByUserId?: string | null,
): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, code: true, organizationId: true, organization: { select: { name: true, isInternal: true } } },
    });
    if (!project) return;
    const base = await getPortalTicketUrl(""); // piggyback for URL base
    const url = base.replace(/\/portal\/tickets\/$/, `/projects/${project.id}`);

    await notifyUser(userId, "project_assigned", {
      title: `Assigné au projet : ${project.name}`,
      body: `${project.code ?? project.name} · ${project.organization?.name ?? "—"}`,
      link: `/projects/${project.id}`,
      metadata: { projectId: project.id },
      emailSubject: `Projet : ${project.name}`,
      email: {
        title: "Vous avez été assigné à un projet",
        intro: `${project.code ?? "Projet"} — ${project.name}`,
        metadata: [
          { label: "Organisation", value: project.organization?.name ?? "—" },
        ],
        ctaUrl: url,
        ctaLabel: "Ouvrir le projet",
      },
    });
  } catch (err) {
    console.error("[dispatchProjectAssigned] erreur :", err);
  }
}

// ============================================================================
// BACKUP FAILED
// ============================================================================

export async function dispatchBackupAlert(opts: {
  organizationName: string;
  jobName: string;
  detail?: string;
}): Promise<void> {
  try {
    const recipients = await listActiveAgents();
    const base = await getPortalTicketUrl("");
    const url = base.replace(/\/portal\/tickets\/$/, "/backups");
    await notifyUsers(recipients, "backup_failed", {
      title: `Échec de sauvegarde : ${opts.jobName}`,
      body: `${opts.organizationName}${opts.detail ? ` · ${opts.detail}` : ""}`,
      link: "/backups",
      metadata: { organizationName: opts.organizationName, jobName: opts.jobName },
      emailSubject: `Sauvegarde en échec : ${opts.jobName}`,
      email: {
        title: "Échec de sauvegarde détecté",
        intro: `${opts.jobName} — ${opts.organizationName}`,
        metadata: [
          { label: "Client", value: opts.organizationName },
          { label: "Tâche", value: opts.jobName },
          ...(opts.detail ? [{ label: "Détail", value: opts.detail }] : []),
        ],
        ctaUrl: url,
        ctaLabel: "Ouvrir Nexus",
      },
    });
  } catch (err) {
    console.error("[dispatchBackupAlert] erreur :", err);
  }
}

// ============================================================================
// MONITORING ALERT
// ============================================================================

export async function dispatchMonitoringAlert(opts: {
  organizationName: string;
  alertTitle: string;
  severity?: string;
  body?: string;
}): Promise<void> {
  try {
    const recipients = await listActiveAgents();
    const base = await getPortalTicketUrl("");
    const url = base.replace(/\/portal\/tickets\/$/, "/monitoring");
    await notifyUsers(recipients, "monitoring_alert", {
      title: `Alerte : ${opts.alertTitle}`,
      body: `${opts.organizationName}${opts.severity ? ` · ${opts.severity.toUpperCase()}` : ""}`,
      link: "/monitoring",
      metadata: { organizationName: opts.organizationName },
      emailSubject: `Alerte monitoring — ${opts.organizationName}`,
      email: {
        title: opts.alertTitle,
        intro: opts.organizationName,
        metadata: [
          { label: "Client", value: opts.organizationName },
          ...(opts.severity ? [{ label: "Sévérité", value: opts.severity }] : []),
        ],
        body: opts.body ? `<p style="margin:0;">${opts.body}</p>` : undefined,
        ctaUrl: url,
        ctaLabel: "Ouvrir le monitoring",
      },
    });
  } catch (err) {
    console.error("[dispatchMonitoringAlert] erreur :", err);
  }
}

// Note : `createInAppNotification` (ancienne API plate qui bypassait les
// préférences utilisateur) a été retirée. Utiliser `notifyUser` de
// src/lib/notifications/notify.ts — il crée la notification in-app
// exactement comme l'ancienne fonction si l'utilisateur a activé ce canal
// pour l'événement, et s'abstient sinon.
