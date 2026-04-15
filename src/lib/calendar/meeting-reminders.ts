// ============================================================================
// Notifications de rappel pour les rencontres
//
// Pour chaque Meeting status=scheduled qui démarre dans les 30 prochaines
// minutes, crée une Notification "meeting_reminder" à chaque participant +
// au créateur.
//
// Idempotent : si une notif du même meetingId existe déjà pour ce user,
// on ne re-crée pas (un seul rappel par rencontre).
// ============================================================================

import prisma from "@/lib/prisma";

// Fenêtre d'alerte : on rappelle tout meeting dont le startsAt est entre
// `now` et `now + REMINDER_LEAD_MS`. Un job tournant aux 5 min suffit pour
// couvrir cette fenêtre sans rater de meeting (avec marge).
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

  let created = 0;
  for (const m of meetings) {
    const recipients = new Set<string>();
    if (m.createdById) recipients.add(m.createdById);
    for (const p of m.participants) recipients.add(p.userId);
    if (recipients.size === 0) continue;

    const minutesUntil = Math.max(0, Math.round((m.startsAt.getTime() - now.getTime()) / 60000));
    const title =
      minutesUntil <= 1
        ? `▶ Rencontre commence : ${m.title}`
        : `⏰ Rencontre dans ${minutesUntil} min : ${m.title}`;
    const body = m.location
      ? `Lieu : ${m.location} · ${m.startsAt.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`
      : `Démarre à ${m.startsAt.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`;

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

      await prisma.notification.create({
        data: {
          userId,
          type: "meeting_reminder",
          title,
          body,
          link: `/calendar/meetings/${m.id}`,
          metadata: { meetingId: m.id, minutesUntil } as unknown as object,
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
    select: { title: true, startsAt: true, location: true },
  });
  if (!m) return;

  const inviter = await prisma.user.findUnique({
    where: { id: inviterId },
    select: { firstName: true, lastName: true },
  });
  const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}` : "Un agent";

  const startStr = m.startsAt.toLocaleString("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  await prisma.notification.createMany({
    data: userIds
      .filter((uid) => uid !== inviterId) // Pas la peine de notifier l'inviter de sa propre invitation.
      .map((userId) => ({
        userId,
        type: "meeting_invite",
        title: `Invité à : ${m.title}`,
        body: `${inviterName} t'a ajouté à la rencontre du ${startStr}${m.location ? ` (${m.location})` : ""}`,
        link: `/calendar/meetings/${meetingId}`,
        metadata: { meetingId } as unknown as object,
      })),
    skipDuplicates: true,
  });
}
