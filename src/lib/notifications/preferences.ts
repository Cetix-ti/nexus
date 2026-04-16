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
}

export function getDefaultPrefs(): NotificationPrefs {
  const events: Record<string, EventPref> = {};
  for (const e of EVENTS) {
    events[e.key] = { ...e.defaults };
  }
  return {
    channels: { inApp: true, email: true },
    events,
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
    return { channels, events };
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
