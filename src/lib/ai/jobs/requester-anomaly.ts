// ============================================================================
// REQUESTER ANOMALY — apprend le rythme habituel de chaque demandeur et
// détecte les comportements inhabituels qui méritent un regard humain :
//
//   - Spike soudain (un user qui fait 8 tickets en 2h alors qu'il en fait
//     1/semaine) → possible compromission compte OU urgence réelle.
//   - Tickets hors horaires habituels (jamais le soir, soudain 3h du matin).
//   - Bascule brutale de catégorie (n'ouvrait que "Imprimantes", ouvre 3
//     tickets sécurité / accès d'un coup).
//
// Baseline stockée par contact dans AiPattern :
//   scope="requester:baseline", kind="profile", key=<contactId>
//   value = {
//     avgTicketsPerWeek,
//     typicalHours    : {dow × hourBand histogram},
//     topCategories   : [{categoryId, fraction}],
//     lastSeenAt,
//     sampleSize
//   }
//
// Anomalie détectée → écriture éphémère dans :
//   scope="requester:anomaly", kind="event", key=<contactId>|<yyyy-mm-dd-HH>
// + notification à l'organisation du MSP (internal ticket) si sévérité HIGH.
//
// 100% SQL + calcul. Refresh toutes les 30 min. Baseline recalculée
// quotidiennement (plus lent).
// ============================================================================

import prisma from "@/lib/prisma";

const BASELINE_LOOKBACK_DAYS = 90;
const ANOMALY_LOOKBACK_HOURS = 4;
const SPIKE_MIN_TICKETS = 4;
const SPIKE_BASELINE_MULTIPLIER = 3;
const MIN_HISTORY_FOR_BASELINE = 6;

interface RequesterBaseline {
  contactId: string;
  avgTicketsPerWeek: number;
  typicalHours: Record<string, number>; // key = "dow:hourBand"
  topCategories: Array<{ categoryId: string; fraction: number }>;
  lastSeenAt: string | null;
  sampleSize: number;
  rebuiltAt: string;
}

interface AnomalyEvent {
  contactId: string;
  contactEmail: string;
  organizationId: string;
  organizationName: string;
  severity: "low" | "medium" | "high";
  signals: string[];
  affectedTicketIds: string[];
  detectedAt: string;
}

// ===========================================================================
// 1. REBUILD BASELINE — quotidien, lent.
// ===========================================================================

export async function rebuildRequesterBaselines(): Promise<{
  contacts: number;
  baselinesWritten: number;
  skipped: number;
}> {
  const stats = { contacts: 0, baselinesWritten: 0, skipped: 0 };
  const since = new Date(Date.now() - BASELINE_LOOKBACK_DAYS * 24 * 3600_000);

  // Contacts actifs qui ont ouvert au moins 1 ticket dans la fenêtre.
  const contacts = await prisma.contact.findMany({
    where: {
      isActive: true,
      tickets: { some: { createdAt: { gte: since } } },
    },
    select: {
      id: true,
      email: true,
    },
    take: 2000,
  });
  stats.contacts = contacts.length;

  for (const c of contacts) {
    const tickets = await prisma.ticket.findMany({
      where: {
        requesterId: c.id,
        createdAt: { gte: since },
      },
      select: { categoryId: true, createdAt: true },
      take: 500,
    });
    if (tickets.length < MIN_HISTORY_FOR_BASELINE) {
      stats.skipped++;
      continue;
    }

    // avgTicketsPerWeek : échantillon tickets / #semaines couvertes (borne
    // inf 1 semaine pour éviter division par zéro).
    const firstSeen = tickets[tickets.length - 1].createdAt;
    const weeks = Math.max(
      1,
      (Date.now() - firstSeen.getTime()) / (7 * 24 * 3600_000),
    );
    const avgTicketsPerWeek =
      Math.round((tickets.length / weeks) * 100) / 100;

    // Typical hours histogram.
    const typicalHours: Record<string, number> = {};
    for (const t of tickets) {
      const dow = t.createdAt.getDay();
      const hourBand = Math.floor(t.createdAt.getHours() / 3); // 0..7
      const k = `${dow}:${hourBand}`;
      typicalHours[k] = (typicalHours[k] ?? 0) + 1;
    }
    // Normalise en fractions.
    const total = tickets.length;
    for (const k of Object.keys(typicalHours)) {
      typicalHours[k] = Math.round((typicalHours[k] / total) * 1000) / 1000;
    }

    // Top categories.
    const catCounts = new Map<string, number>();
    for (const t of tickets) {
      if (!t.categoryId) continue;
      catCounts.set(t.categoryId, (catCounts.get(t.categoryId) ?? 0) + 1);
    }
    const topCategories = Array.from(catCounts.entries())
      .map(([categoryId, count]) => ({
        categoryId,
        fraction: Math.round((count / total) * 1000) / 1000,
      }))
      .sort((a, b) => b.fraction - a.fraction)
      .slice(0, 8);

    const baseline: RequesterBaseline = {
      contactId: c.id,
      avgTicketsPerWeek,
      typicalHours,
      topCategories,
      lastSeenAt: tickets[0]?.createdAt.toISOString() ?? null,
      sampleSize: tickets.length,
      rebuiltAt: new Date().toISOString(),
    };

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "requester:baseline",
            kind: "profile",
            key: c.id,
          },
        },
        create: {
          scope: "requester:baseline",
          kind: "profile",
          key: c.id,
          value: baseline as never,
          sampleCount: tickets.length,
          confidence: Math.min(1, tickets.length / 25),
        },
        update: {
          value: baseline as never,
          sampleCount: tickets.length,
          confidence: Math.min(1, tickets.length / 25),
        },
      });
      stats.baselinesWritten++;
    } catch (err) {
      console.warn(
        `[requester-anomaly] baseline upsert failed for ${c.id}:`,
        err,
      );
      stats.skipped++;
    }
  }

  return stats;
}

// ===========================================================================
// 2. DETECT ANOMALIES — fréquent, rapide.
// ===========================================================================

export async function detectRequesterAnomalies(): Promise<{
  contactsChecked: number;
  anomaliesDetected: number;
  highSeverity: number;
}> {
  const stats = {
    contactsChecked: 0,
    anomaliesDetected: 0,
    highSeverity: 0,
  };

  const since = new Date(Date.now() - ANOMALY_LOOKBACK_HOURS * 3600_000);
  // Tickets récents groupés par requester.
  const recent = await prisma.ticket.findMany({
    where: {
      requesterId: { not: null },
      createdAt: { gte: since },
    },
    select: {
      id: true,
      createdAt: true,
      categoryId: true,
      requesterId: true,
      organizationId: true,
      organization: { select: { name: true } },
      requester: { select: { email: true } },
    },
  });
  if (recent.length === 0) return stats;

  const byContact = new Map<string, typeof recent>();
  for (const t of recent) {
    if (!t.requesterId) continue;
    const list = byContact.get(t.requesterId) ?? [];
    list.push(t);
    byContact.set(t.requesterId, list);
  }

  const contactIds = Array.from(byContact.keys());
  const baselines = await prisma.aiPattern.findMany({
    where: {
      scope: "requester:baseline",
      kind: "profile",
      key: { in: contactIds },
    },
    select: { key: true, value: true },
  });
  const baselineByContact = new Map<string, RequesterBaseline>();
  for (const b of baselines) {
    const v = b.value as Partial<RequesterBaseline> | null;
    if (v?.contactId) baselineByContact.set(b.key, v as RequesterBaseline);
  }

  for (const [contactId, tickets] of byContact) {
    stats.contactsChecked++;
    const baseline = baselineByContact.get(contactId);
    if (!baseline) continue; // pas assez d'historique

    const signals: string[] = [];
    let severity: AnomalyEvent["severity"] = "low";

    // Signal 1 : spike de volume.
    const expectedInWindow =
      (baseline.avgTicketsPerWeek / (7 * 24)) * ANOMALY_LOOKBACK_HOURS;
    const observed = tickets.length;
    if (
      observed >= SPIKE_MIN_TICKETS &&
      observed >= expectedInWindow * SPIKE_BASELINE_MULTIPLIER
    ) {
      signals.push(
        `${observed} tickets en ${ANOMALY_LOOKBACK_HOURS}h (attendu ~${expectedInWindow.toFixed(1)})`,
      );
      severity = "medium";
      if (observed >= expectedInWindow * 6) severity = "high";
    }

    // Signal 2 : hours hors histogramme habituel.
    for (const t of tickets) {
      const dow = t.createdAt.getDay();
      const hourBand = Math.floor(t.createdAt.getHours() / 3);
      const k = `${dow}:${hourBand}`;
      const hist = baseline.typicalHours[k] ?? 0;
      if (hist < 0.02 && baseline.sampleSize >= 20) {
        signals.push(
          `ticket ${t.createdAt.toISOString().slice(11, 16)} hors créneaux habituels`,
        );
        if (severity === "low") severity = "medium";
        break;
      }
    }

    // Signal 3 : catégorie jamais utilisée par ce requester.
    const knownCats = new Set(baseline.topCategories.map((c) => c.categoryId));
    const foreignCat = tickets.find(
      (t) => t.categoryId && !knownCats.has(t.categoryId),
    );
    if (foreignCat && baseline.sampleSize >= 15) {
      signals.push(
        `catégorie inhabituelle pour ce demandeur (${foreignCat.categoryId})`,
      );
      if (severity === "low") severity = "medium";
    }

    if (signals.length === 0) continue;
    if (severity === "high") stats.highSeverity++;
    stats.anomaliesDetected++;

    const event: AnomalyEvent = {
      contactId,
      contactEmail: tickets[0].requester?.email ?? "(inconnu)",
      organizationId: tickets[0].organizationId,
      organizationName: tickets[0].organization?.name ?? "(inconnu)",
      severity,
      signals,
      affectedTicketIds: tickets.map((t) => t.id),
      detectedAt: new Date().toISOString(),
    };

    const key = `${contactId}|${new Date().toISOString().slice(0, 13)}`;
    // On sait si c'est une nouvelle occurrence (upsert ne le dit pas).
    // Lit la clé existante avant l'écriture pour comparer.
    const existing = await prisma.aiPattern.findUnique({
      where: {
        scope_kind_key: {
          scope: "requester:anomaly",
          kind: "event",
          key,
        },
      },
      select: { id: true },
    });
    const isNew = !existing;

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "requester:anomaly",
            kind: "event",
            key,
          },
        },
        create: {
          scope: "requester:anomaly",
          kind: "event",
          key,
          value: event as never,
          sampleCount: tickets.length,
          confidence:
            severity === "high" ? 0.9 : severity === "medium" ? 0.6 : 0.4,
        },
        update: {
          value: event as never,
          sampleCount: tickets.length,
        },
      });

      // Notification in-app pour les admins MSP si c'est une NOUVELLE
      // anomalie de sévérité HIGH. Dédup implicite : la clé horaire change
      // d'heure en heure, donc au pire 1 notif/h par contactId en spike.
      if (isNew && severity === "high") {
        await notifyAdminsOfCriticalAnomaly(event).catch((err) =>
          console.warn("[requester-anomaly] notify admins failed:", err),
        );
      }
    } catch (err) {
      console.warn(`[requester-anomaly] upsert failed for ${contactId}:`, err);
    }
  }

  // Nettoyage : anomalies > 7j.
  const staleBefore = new Date(Date.now() - 7 * 24 * 3600_000);
  const stale = await prisma.aiPattern.findMany({
    where: { scope: "requester:anomaly", kind: "event" },
    select: { id: true, lastUpdatedAt: true },
  });
  const toDelete = stale
    .filter((s) => s.lastUpdatedAt < staleBefore)
    .map((s) => s.id);
  if (toDelete.length > 0) {
    await prisma.aiPattern.deleteMany({ where: { id: { in: toDelete } } });
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Notification admins — pour chaque anomalie HIGH non déjà notifiée dans les
// dernières 6h (dédup via lookup notification). Crée une entrée in-app par
// admin MSP actif. Fail-open : tout échec est loggé mais ne bloque pas le job.
// ---------------------------------------------------------------------------

async function notifyAdminsOfCriticalAnomaly(event: AnomalyEvent): Promise<void> {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ["SUPER_ADMIN", "MSP_ADMIN"] },
      isActive: true,
    },
    select: { id: true },
  });
  if (admins.length === 0) return;

  const since = new Date(Date.now() - 6 * 3600_000);
  // On cherche s'il existe DÉJÀ une notification récente pour ce contactId
  // (tous destinataires confondus) — évite de spammer 3 admins 4 fois/h si
  // le job tourne aux 30 min.
  const alreadyNotified = await prisma.notification.findFirst({
    where: {
      type: "requester_anomaly",
      metadata: {
        path: ["contactId"],
        equals: event.contactId,
      } as never,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (alreadyNotified) return;

  const title = `Anomalie requester critique — ${event.contactEmail}`;
  const body =
    event.signals.length > 0
      ? event.signals.slice(0, 2).join(" · ")
      : "Comportement inhabituel détecté.";

  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "requester_anomaly",
      title,
      body: `${body} (${event.organizationName})`,
      link: `/intelligence/anomalies`,
      metadata: {
        contactId: event.contactId,
        contactEmail: event.contactEmail,
        organizationId: event.organizationId,
        severity: event.severity,
        affectedTicketIds: event.affectedTicketIds,
      } as never,
    })),
  });
}

// ---------------------------------------------------------------------------
// Helper public — anomalies récentes pour un dashboard "alertes requester".
// ---------------------------------------------------------------------------

export async function getRecentRequesterAnomalies(
  limit = 20,
): Promise<AnomalyEvent[]> {
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "requester:anomaly", kind: "event" },
    orderBy: { lastUpdatedAt: "desc" },
    take: limit * 2,
    select: { value: true },
  });
  const out: AnomalyEvent[] = [];
  for (const r of rows) {
    const v = r.value as Partial<AnomalyEvent> | null;
    if (!v || typeof v.contactId !== "string") continue;
    out.push(v as AnomalyEvent);
  }
  return out.slice(0, limit);
}
