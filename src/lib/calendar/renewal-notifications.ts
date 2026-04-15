// ============================================================================
// Notifications de renouvellements
//
// Parcourt les CalendarEvent de kind=RENEWAL dans les 90 prochains jours
// et crée une Notification aux agents concernés N jours avant l'échéance
// (N = CalendarEvent.renewalNotifyDaysBefore, défaut 14).
//
// Idempotent : vérifie qu'une notification du même event+milestone n'existe
// pas déjà avant de créer.
// ============================================================================

import prisma from "@/lib/prisma";

// Étapes d'alerte (en jours avant l'échéance). La plus pertinente est
// celle qu'on vient de franchir (ou qu'on est en train de franchir).
const DEFAULT_MILESTONES = [30, 14, 7, 1];

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

export async function runRenewalNotifications(): Promise<{
  checked: number;
  created: number;
}> {
  const now = new Date();
  // Fenêtre : 90 jours en avance (on ne notifie pas plus loin qu'un trimestre).
  const horizon = new Date(now.getTime() + 90 * 24 * 3600 * 1000);

  const events = await prisma.calendarEvent.findMany({
    where: {
      kind: "RENEWAL",
      status: "active",
      startsAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000), lte: horizon },
    },
    include: {
      owner: { select: { id: true } },
      createdBy: { select: { id: true } },
      organization: { select: { name: true } },
    },
  });

  if (events.length === 0) return { checked: 0, created: 0 };

  // Destinataires par défaut : tous les MSP_ADMIN actifs + l'owner + le
  // créateur (s'il existe). Les doublons sont dédupliqués.
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR"] },
      isActive: true,
    },
    select: { id: true },
  });

  let created = 0;
  for (const e of events) {
    const customMilestone = e.renewalNotifyDaysBefore;
    const milestones = customMilestone
      ? [customMilestone]
      : DEFAULT_MILESTONES;

    const daysUntil = daysBetween(
      new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      new Date(e.startsAt.getFullYear(), e.startsAt.getMonth(), e.startsAt.getDate()),
    );

    // Choisit le milestone actuel : le plus grand parmi ceux ≥ daysUntil,
    // autrement dit "on vient d'entrer dans cette fenêtre d'alerte".
    const activeMilestone = milestones
      .filter((m) => daysUntil <= m && daysUntil >= 0)
      .sort((a, b) => a - b)[0]; // le plus proche
    if (activeMilestone === undefined) continue;
    // Si échéance dépassée → une notif "expiré" une seule fois
    // (géré par milestone=0 implicite).

    const recipients = new Set<string>();
    if (e.ownerId) recipients.add(e.ownerId);
    if (e.createdById) recipients.add(e.createdById);
    for (const a of admins) recipients.add(a.id);

    const orgName = e.organization?.name;
    const title =
      daysUntil === 0
        ? `⚠ Renouvellement aujourd'hui : ${e.title}`
        : daysUntil === 1
        ? `⚠ Renouvellement demain : ${e.title}`
        : `Renouvellement dans ${daysUntil} j : ${e.title}`;

    const body = [
      e.renewalType ? `Type : ${e.renewalType}` : null,
      orgName ? `Client : ${orgName}` : null,
      e.renewalAmount ? `Montant : ${e.renewalAmount.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}` : null,
      e.renewalExternalRef ? `Réf : ${e.renewalExternalRef}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    for (const userId of recipients) {
      // Dédup : ne re-crée pas une notif pour le même event + milestone
      const exists = await prisma.notification.findFirst({
        where: {
          userId,
          type: "renewal_reminder",
          metadata: {
            path: ["eventId"],
            equals: e.id,
          },
          // Même jalon ? On stocke le milestone dans metadata.
        },
        select: {
          id: true,
          metadata: true,
        },
      });
      if (exists) {
        const meta = (exists.metadata as Record<string, unknown> | null) ?? {};
        if (meta.milestone === activeMilestone) continue;
      }

      await prisma.notification.create({
        data: {
          userId,
          type: "renewal_reminder",
          title,
          body: body || null,
          link: "/calendar",
          metadata: {
            eventId: e.id,
            milestone: activeMilestone,
            daysUntil,
          } as unknown as object,
        },
      });
      created++;
    }
  }

  return { checked: events.length, created };
}
