// ============================================================================
// NOTIFICATION PREFERENCES — lecture/écriture des préférences par agent.
//
// Le JSON est stocké dans User.preferences sous la clé "notifications" :
//
// {
//   "notifications": {
//     "channels": { "inApp": true, "email": true },
//     "events":   {
//       "ticket_assigned": { "inApp": true,  "email": true  },
//       "ticket_comment":  { "inApp": true,  "email": false },
//       ...
//     }
//   }
// }
//
// Défauts :
//   - channels.inApp = true, channels.email = true
//   - events[K] = défaut déclaré dans events.ts (EVENTS[].defaults)
//
// canNotify(userId, event, channel) combine :
//   - le toggle global du canal
//   - ET le toggle par événement
// Les deux doivent être ON pour que la notification soit émise.
// ============================================================================

import prisma from "@/lib/prisma";
import { EVENTS, type NotificationChannel, getEventDefaults } from "./events";

export interface EventPref {
  inApp: boolean;
  email: boolean;
}

export interface NotificationPrefs {
  channels: { inApp: boolean; email: boolean };
  events: Record<string, EventPref>;
  /** Toggle global : si false, l'agent ne reçoit PAS de notification
   *  pour les nouveaux tickets en attente d'approbation. Couvre les
   *  events "ticket_assigned" et "ticket_unassigned_pool" quand le
   *  ticket a `requiresApproval=true && approvalStatus="PENDING"`. */
  skipPendingApproval: boolean;
  /** Durée d'affichage des toasts in-app (en ms). 0 = permanent
   *  (l'agent doit cliquer "x" pour fermer). Default 8000ms (8s). */
  inAppDuration: number;
}

export function getDefaultPrefs(): NotificationPrefs {
  const events: Record<string, EventPref> = {};
  for (const e of EVENTS) {
    events[e.key] = { ...e.defaults };
  }
  return {
    channels: { inApp: true, email: true },
    events,
    // Default false : on garde les notifications de tickets en attente
    // d'approbation activées par défaut (comportement V1). L'agent peut
    // désactiver explicitement.
    skipPendingApproval: false,
    // 8 secondes — comportement historique du store de toasts.
    inAppDuration: 8000,
  };
}

/**
 * Lit les préférences d'un agent, en fusionnant avec les defaults pour
 * les événements non encore personnalisés. Ne throw jamais — retombe sur
 * les defaults si l'utilisateur n'existe pas.
 */
export async function getUserNotificationPrefs(
  userId: string,
): Promise<NotificationPrefs> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const raw = (user?.preferences as { notifications?: Partial<NotificationPrefs> } | null)
      ?.notifications;
    if (!raw) return getDefaultPrefs();
    const defaults = getDefaultPrefs();
    // Channels : on respecte ce que l'utilisateur a mis, sinon défaut true.
    const channels = {
      inApp: raw.channels?.inApp ?? defaults.channels.inApp,
      email: raw.channels?.email ?? defaults.channels.email,
    };
    // Events : merge du JSON DB avec defaults — tout événement manquant
    // retombe sur son default. Les événements stockés mais plus dans le
    // catalogue (legacy) sont silencieusement ignorés par le dispatcher.
    const events: Record<string, EventPref> = { ...defaults.events };
    if (raw.events) {
      for (const [key, pref] of Object.entries(raw.events)) {
        if (!pref) continue;
        events[key] = {
          inApp: pref.inApp ?? events[key]?.inApp ?? false,
          email: pref.email ?? events[key]?.email ?? false,
        };
      }
    }
    // Validation inAppDuration : entier dans [0, 600_000] (10 min max).
    // 0 = permanent. Défaut 8000ms.
    let inAppDuration = defaults.inAppDuration;
    if (typeof raw.inAppDuration === "number" && Number.isFinite(raw.inAppDuration)) {
      inAppDuration = Math.max(0, Math.min(600_000, Math.round(raw.inAppDuration)));
    }
    return {
      channels,
      events,
      skipPendingApproval: raw.skipPendingApproval ?? defaults.skipPendingApproval,
      inAppDuration,
    };
  } catch (err) {
    console.warn("[notifications/prefs] load failed, fallback defaults:", err);
    return getDefaultPrefs();
  }
}

/**
 * Écrit les préférences d'un agent. Idempotent — remplace entièrement le
 * sous-objet `notifications`. Les autres clés du `preferences` JSON
 * (langue, timezone, etc.) sont préservées.
 */
export async function saveUserNotificationPrefs(
  userId: string,
  prefs: NotificationPrefs,
): Promise<NotificationPrefs> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const current = (existing?.preferences as Record<string, unknown> | null) ?? {};
  const next = { ...current, notifications: prefs };
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: next as never },
  });
  return prefs;
}

/**
 * Le seul point de décision : ce user veut-il recevoir cet event sur ce
 * canal ? Retourne true/false. Utilisé systématiquement par le dispatcher.
 */
export async function canNotify(
  userId: string,
  eventKey: string,
  channel: NotificationChannel,
): Promise<boolean> {
  const prefs = await getUserNotificationPrefs(userId);
  if (!prefs.channels[channel]) return false;
  const evPref = prefs.events[eventKey];
  if (!evPref) {
    // Événement inconnu des prefs stockées → retombe sur défaut déclaré.
    return getEventDefaults(eventKey)[channel];
  }
  return evPref[channel];
}

/**
 * Retourne la liste des userIds qui veulent être notifiés pour un ticket
 * en attente d'approbation (filtre `skipPendingApproval=true` éliminé).
 * Si le ticket n'est PAS en attente d'approbation, retourne la liste
 * complète sans filtrer (no-op).
 *
 * Appelé en amont de notifyUsers() dans dispatchTicketCreatedNotifications
 * pour respecter la préférence agent.
 */
export async function filterRecipientsForPendingApproval(
  recipients: string[],
  isPendingApproval: boolean,
): Promise<string[]> {
  if (!isPendingApproval || recipients.length === 0) return recipients;
  const out: string[] = [];
  for (const uid of recipients) {
    const prefs = await getUserNotificationPrefs(uid);
    if (!prefs.skipPendingApproval) out.push(uid);
  }
  return out;
}
