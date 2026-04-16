// ============================================================================
// CENTRAL NOTIFICATION DISPATCHER
//
// `notifyUser(userId, event, content)` est le point d'entrée unique pour
// toute notification sortante. Il :
//   1. vérifie les préférences du destinataire (canaux + type d'événement)
//   2. crée une Notification in-app si prefs.inApp=true
//   3. envoie un email Nexus-branded si prefs.email=true + email agent dispo
//
// Ne throw jamais. Swallow les erreurs (log console) pour que les opérations
// métier (ex: create ticket) ne fail jamais à cause d'une notification.
//
// Pour les contacts (externes), utiliser dispatcher dédié — cette fonction est
// strictement pour les User (agents internes).
// ============================================================================

import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { buildNexusEmail, type NexusEmailOptions } from "@/lib/email/nexus-template";
import { canNotify } from "./preferences";
import { getPortalBaseUrl } from "@/lib/portal-domain/url";

export interface NotifyContent {
  /** Titre in-app (court — apparaît dans la cloche). */
  title: string;
  /** Corps court in-app (optionnel — sous-ligne). */
  body?: string;
  /** Deep link relatif (ex: "/tickets/abc"). */
  link?: string;
  /** Métadonnées libres pour la Notification. */
  metadata?: Record<string, unknown>;
  /** Options complètes pour le template email (si l'email doit être envoyé). */
  email: Omit<NexusEmailOptions, "event">;
  /** Sujet du courriel (distinct du title in-app pour contrôle fin). */
  emailSubject: string;
}

/**
 * Notifie un agent sur un événement donné. Respecte les préférences de
 * l'agent (canaux + par-event) et lance les envois en parallèle.
 */
export async function notifyUser(
  userId: string,
  event: string,
  content: NotifyContent,
): Promise<void> {
  try {
    const [allowInApp, allowEmail] = await Promise.all([
      canNotify(userId, event, "inApp"),
      canNotify(userId, event, "email"),
    ]);

    // Charge l'email agent + prepare prefsUrl (dynamique via portal-domain).
    let agentEmail: string | null = null;
    if (allowEmail) {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, isActive: true },
      });
      if (u?.isActive && u.email) agentEmail = u.email;
    }

    const promises: Promise<unknown>[] = [];

    if (allowInApp) {
      promises.push(
        prisma.notification.create({
          data: {
            userId,
            type: event,
            title: content.title,
            body: content.body ?? null,
            link: content.link ?? null,
            metadata: (content.metadata ?? {}) as never,
          },
        }),
      );
    }

    if (allowEmail && agentEmail) {
      // Lien vers les préférences pour unsubscribe en 1 clic.
      const base = await getPortalBaseUrl();
      const prefsUrl = `${base}/account?tab=notifications`;
      const html = buildNexusEmail({
        event,
        ...content.email,
        prefsUrl,
      });
      promises.push(sendEmail(agentEmail, content.emailSubject, html));
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.warn(`[notify] ${event} for user ${userId} failed:`, err);
  }
}

/**
 * Notifie plusieurs agents en parallèle. Chaque agent passe par le même
 * filtre de préférences. Exclut optionnellement un userId (ex: l'auteur
 * de l'action) pour éviter qu'il s'auto-notifie.
 */
export async function notifyUsers(
  userIds: string[],
  event: string,
  content: NotifyContent,
  excludeUserId?: string,
): Promise<void> {
  const unique = Array.from(new Set(userIds)).filter((id) => id && id !== excludeUserId);
  if (unique.length === 0) return;
  await Promise.allSettled(unique.map((id) => notifyUser(id, event, content)));
}
