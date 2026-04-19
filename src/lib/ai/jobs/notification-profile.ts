// ============================================================================
// NOTIFICATION PROFILE — apprend le pattern d'engagement de chaque user
// avec ses notifications, pour permettre un BATCHING intelligent.
//
// Les préférences explicites (settings user) gouvernent déjà le CANAL
// (email, in-app, push). Ce système apprend en plus :
//   - À quelles heures l'utilisateur LIT réellement (vs laisse traîner).
//   - Quels types de notification il IGNORE systématiquement (read rate < 10%).
//   - Quels jours de la semaine il est actif.
//
// Output : un profil par user dans AiPattern(scope="notification:profile",
// kind="user", key=<userId>) avec :
//   - activeWindows : créneaux [dow, hourBand] où le user a historiquement
//                     le plus d'engagement
//   - quietWindows  : créneaux où l'engagement tombe < QUIET_THRESHOLD
//   - typeEngagement: par type de notif, {total, read, readRate, skipped}
//
// Helpers publics :
//   - shouldBatchForUser(userId, when) : retourne { shouldBatch, nextActiveAt }
//   - shouldSuppressType(userId, type) : true si readRate < suppress cutoff
//
// Le service de notifications peut opt-in sur ces signaux. Par défaut rien
// n'est auto-supprimé — c'est un signal disponible pour une V2 qui fera
// vraiment du batching (ex: digest email au lieu de notifications
// instantanées pendant les quiet hours).
// ============================================================================

import prisma from "@/lib/prisma";

const BASELINE_LOOKBACK_DAYS = 90;
const MIN_NOTIFICATIONS_FOR_PROFILE = 15;
const QUIET_READ_RATE_THRESHOLD = 0.25;
const SUPPRESS_READ_RATE_THRESHOLD = 0.05;

interface HourStats {
  dow: number;
  hourBand: number; // 0..7 (3h chacun)
  total: number;
  read: number;
  readRate: number;
}

interface TypeEngagement {
  type: string;
  total: number;
  read: number;
  readRate: number;
}

interface NotificationProfile {
  userId: string;
  activeWindows: HourStats[];   // top 4 créneaux d'activité
  quietWindows: HourStats[];    // créneaux où readRate < threshold (et total ≥ 3)
  typeEngagement: TypeEngagement[];
  totalNotifications: number;
  overallReadRate: number;
  rebuiltAt: string;
}

export async function rebuildNotificationProfiles(): Promise<{
  users: number;
  profilesWritten: number;
  skipped: number;
}> {
  const stats = { users: 0, profilesWritten: 0, skipped: 0 };
  const since = new Date(Date.now() - BASELINE_LOOKBACK_DAYS * 24 * 3600_000);

  // Récupère tous les users qui ont reçu des notifications dans la fenêtre.
  const grouped = await prisma.notification.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: since } },
    _count: { id: true },
    having: {
      id: { _count: { gte: MIN_NOTIFICATIONS_FOR_PROFILE } },
    },
    orderBy: { _count: { id: "desc" } },
    take: 500,
  });
  stats.users = grouped.length;

  for (const g of grouped) {
    const userId = g.userId;
    const notifs = await prisma.notification.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { type: true, isRead: true, createdAt: true },
      take: 1000,
    });
    if (notifs.length < MIN_NOTIFICATIONS_FOR_PROFILE) {
      stats.skipped++;
      continue;
    }

    // Histogramme dow × hourBand (notifications REÇUES à ce créneau).
    const byHour = new Map<string, { total: number; read: number }>();
    for (const n of notifs) {
      const dow = n.createdAt.getDay();
      const hb = Math.floor(n.createdAt.getHours() / 3);
      const k = `${dow}:${hb}`;
      const cur = byHour.get(k) ?? { total: 0, read: 0 };
      cur.total++;
      if (n.isRead) cur.read++;
      byHour.set(k, cur);
    }

    const hourStats: HourStats[] = [];
    for (const [k, v] of byHour) {
      const [dow, hb] = k.split(":").map(Number);
      hourStats.push({
        dow,
        hourBand: hb,
        total: v.total,
        read: v.read,
        readRate: v.total > 0 ? Math.round((v.read / v.total) * 1000) / 1000 : 0,
      });
    }

    // Active windows : top 4 créneaux par READ COUNT absolu (pas readRate
    // seul — un créneau avec 1 notif lue n'est pas un "active window").
    const active = [...hourStats]
      .sort((a, b) => b.read - a.read)
      .slice(0, 4);

    // Quiet windows : readRate < threshold ET total ≥ 3.
    const quiet = hourStats
      .filter((h) => h.total >= 3 && h.readRate < QUIET_READ_RATE_THRESHOLD)
      .sort((a, b) => a.readRate - b.readRate)
      .slice(0, 8);

    // Engagement par type.
    const byType = new Map<string, { total: number; read: number }>();
    for (const n of notifs) {
      const cur = byType.get(n.type) ?? { total: 0, read: 0 };
      cur.total++;
      if (n.isRead) cur.read++;
      byType.set(n.type, cur);
    }
    const typeEngagement: TypeEngagement[] = Array.from(byType.entries())
      .map(([type, v]) => ({
        type,
        total: v.total,
        read: v.read,
        readRate: v.total > 0 ? Math.round((v.read / v.total) * 1000) / 1000 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const totalRead = notifs.filter((n) => n.isRead).length;
    const overallReadRate =
      Math.round((totalRead / notifs.length) * 1000) / 1000;

    const profile: NotificationProfile = {
      userId,
      activeWindows: active,
      quietWindows: quiet,
      typeEngagement,
      totalNotifications: notifs.length,
      overallReadRate,
      rebuiltAt: new Date().toISOString(),
    };

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "notification:profile",
            kind: "user",
            key: userId,
          },
        },
        create: {
          scope: "notification:profile",
          kind: "user",
          key: userId,
          value: profile as never,
          sampleCount: notifs.length,
          confidence: Math.min(1, notifs.length / 50),
        },
        update: {
          value: profile as never,
          sampleCount: notifs.length,
          confidence: Math.min(1, notifs.length / 50),
        },
      });
      stats.profilesWritten++;
    } catch (err) {
      console.warn(
        `[notification-profile] upsert failed for ${userId}:`,
        err,
      );
      stats.skipped++;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helpers publics — consommés par le service de notifications si/quand
// il active le batching intelligent.
// ---------------------------------------------------------------------------

interface ProfileCache {
  at: number;
  byUser: Map<string, NotificationProfile | null>;
}
let profileCache: ProfileCache = { at: 0, byUser: new Map() };
const PROFILE_CACHE_TTL_MS = 15 * 60_000;

async function loadProfile(
  userId: string,
): Promise<NotificationProfile | null> {
  if (
    Date.now() - profileCache.at < PROFILE_CACHE_TTL_MS &&
    profileCache.byUser.has(userId)
  ) {
    return profileCache.byUser.get(userId) ?? null;
  }
  const row = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: "notification:profile",
        kind: "user",
        key: userId,
      },
    },
    select: { value: true },
  });
  const v = row?.value as Partial<NotificationProfile> | null;
  const profile =
    v && typeof v.userId === "string" ? (v as NotificationProfile) : null;
  if (Date.now() - profileCache.at >= PROFILE_CACHE_TTL_MS) {
    profileCache = { at: Date.now(), byUser: new Map() };
  }
  profileCache.byUser.set(userId, profile);
  return profile;
}

/**
 * Le notification service peut appeler ceci AVANT d'envoyer pour décider
 * s'il vaut mieux retenir et envoyer plus tard (batching). Respecte toujours
 * les préférences explicites user — ce helper ne suggère QUE pour les
 * notifications déjà autorisées par le canal.
 */
export async function shouldBatchForUser(
  userId: string,
  when: Date = new Date(),
): Promise<{ shouldBatch: boolean; nextActiveAt: Date | null; reason: string }> {
  const profile = await loadProfile(userId);
  if (!profile) {
    return { shouldBatch: false, nextActiveAt: null, reason: "no profile" };
  }
  const dow = when.getDay();
  const hb = Math.floor(when.getHours() / 3);
  const quiet = profile.quietWindows.find(
    (q) => q.dow === dow && q.hourBand === hb,
  );
  if (!quiet) {
    return {
      shouldBatch: false,
      nextActiveAt: null,
      reason: "current window is active",
    };
  }
  // Trouver le prochain active window >= now.
  const activeSlots = profile.activeWindows.map((a) => ({
    dow: a.dow,
    hourBand: a.hourBand,
  }));
  const nextActiveAt = nextSlotFrom(when, activeSlots);
  return {
    shouldBatch: true,
    nextActiveAt,
    reason: `user quiet window (read rate ${quiet.readRate}, ${quiet.total} notifs vues dans ce créneau)`,
  };
}

export async function shouldSuppressType(
  userId: string,
  type: string,
): Promise<boolean> {
  const profile = await loadProfile(userId);
  if (!profile) return false;
  const engagement = profile.typeEngagement.find((t) => t.type === type);
  if (!engagement) return false;
  // Réglage prudent : nécessite un volume minimum pour suggérer de supprimer.
  if (engagement.total < 10) return false;
  return engagement.readRate < SUPPRESS_READ_RATE_THRESHOLD;
}

function nextSlotFrom(
  from: Date,
  slots: Array<{ dow: number; hourBand: number }>,
): Date | null {
  if (slots.length === 0) return null;
  // Cherche dans les prochaines 7 × 8 = 56 cases horaires.
  for (let offset = 1; offset <= 56; offset++) {
    const candidate = new Date(from.getTime() + offset * 3 * 3600_000);
    const dow = candidate.getDay();
    const hb = Math.floor(candidate.getHours() / 3);
    if (slots.some((s) => s.dow === dow && s.hourBand === hb)) {
      // Retourne le début de la tranche 3h (minutes=0).
      candidate.setMinutes(0, 0, 0);
      candidate.setHours(hb * 3);
      return candidate;
    }
  }
  return null;
}
