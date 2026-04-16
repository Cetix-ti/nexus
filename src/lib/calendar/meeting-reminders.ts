// ============================================================================
// Notifications de rappel pour les rencontres
//
// Pour chaque Meeting status=scheduled qui démarre dans les 30 prochaines
// minutes, émet un rappel via le dispatcher central (notifyUser) à chaque
// participant + au créateur. L'utilisateur peut couper le rappel via
// Paramètres → Notifications → "Rappel de rencontre".
//
// Idempotent : si une notif du même meetingId existe déjà pour ce user,
// on ne re-crée pas (un seul rappel par rencontre).
// ============================================================================

import prisma from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications/notify";
import { getPortalBaseUrl } from "@/lib/portal-domain/url";

const REMINDER_LEAD_MS = 30 * 60 * 1000; // 30 minutes

export async function runMeetingReminders(): Promise<{
  checked: number;
  created: number;
}> {
  const now = new Date();
  const horizon = new Date(now.getTime() + REMINDER_LEAD_MS);

  const meetings = await prisma.meeting.findMany({
    where: {
      status: "scheduled",
      startsAt: { gte: now, lte: horizon },
    },
    include: {
      participants: { select: { userId: true } },
      createdBy: { select: { id: true } },
    },
  });
  if (meetings.length === 0) return { checked: 0, created: 0 };

  const base = await getPortalBaseUrl();
  let created = 0;
  for (const m of meetings) {
    const recipients = new Set<string>();
    if (m.createdById) recipients.add(m.createdById);
    for (const p of m.participants) recipients.add(p.userId);
    if (recipients.size === 0) continue;

    const minutesUntil = Math.max(0, Math.round((m.startsAt.getTime() - now.getTime()) / 60000));
    const timeStr = m.startsAt.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
    const inAppTitle =
      minutesUntil <= 1
        ? `▶ Rencontre commence : ${m.title}`
        : `⏰ Rencontre dans ${minutesUntil} min : ${m.title}`;
    const inAppBody = m.location ? `Lieu : ${m.location} · ${timeStr}` : `Démarre à ${timeStr}`;

    for (const userId of recipients) {
      // Dédup : un seul rappel par rencontre + utilisateur.
      const exists = await prisma.notification.findFirst({
        where: {
          userId,
          type: "meeting_reminder",
          metadata: { path: ["meetingId"], equals: m.id },
        },
        select: { id: true },
      });
      if (exists) continue;

      await notifyUser(userId, "meeting_reminder", {
        title: inAppTitle,
        body: inAppBody,
        link: `/calendar/meetings/${m.id}`,
        metadata: { meetingId: m.id, minutesUntil },
        emailSubject: `Rappel — ${m.title} (${timeStr})`,
        email: {
          title: "Rappel de rencontre",
          intro:
            minutesUntil <= 1
              ? "Votre rencontre commence maintenant"
              : `Votre rencontre commence dans ${minutesUntil} minutes`,
          metadata: [
            { label: "Titre", value: m.title },
            { label: "Heure", value: timeStr },
            ...(m.location ? [{ label: "Lieu", value: m.location }] : []),
          ],
          ctaUrl: `${base}/calendar/meetings/${m.id}`,
          ctaLabel: "Ouvrir la rencontre",
        },
      });
      created++;
    }
  }
  return { checked: meetings.length, created };
}

/**
 * Notifie un utilisateur qu'il a été ajouté comme participant à une réunion.
 * Appelé depuis l'endpoint POST /meetings/[id]/participants.
 */
export async function notifyMeetingInvite(
  meetingId: string,
  userIds: string[],
  inviterId: string,
): Promise<void> {
  if (userIds.length === 0) return;

  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { title: true, startsAt: true, location: true, description: true },
  });
  if (!m) return;

  const inviter = await prisma.user.findUnique({
    where: { id: inviterId },
    select: { firstName: true, lastName: true },
  });
  const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : "Un agent";

  const startStr = m.startsAt.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
  const base = await getPortalBaseUrl();

  for (const userId of userIds) {
    if (userId === inviterId) continue; // pas la peine de s'auto-notifier
    await notifyUser(userId, "meeting_invite", {
      title: `Invité à : ${m.title}`,
      body: `${inviterName} t'a ajouté à la rencontre du ${startStr}${m.location ? ` (${m.location})` : ""}`,
      link: `/calendar/meetings/${meetingId}`,
      metadata: { meetingId },
      emailSubject: `Invitation — ${m.title}`,
      email: {
        title: "Vous êtes invité à une rencontre",
        intro: `${inviterName} vous a ajouté à la rencontre.`,
        metadata: [
          { label: "Titre", value: m.title },
          { label: "Date et heure", value: startStr },
          ...(m.location ? [{ label: "Lieu", value: m.location }] : []),
        ],
        body: m.description ? `<p style="margin:0;">${m.description}</p>` : undefined,
        ctaUrl: `${base}/calendar/meetings/${meetingId}`,
        ctaLabel: "Voir la rencontre",
      },
    });
  }
}
