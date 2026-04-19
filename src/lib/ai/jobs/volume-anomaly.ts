// ============================================================================
// VOLUME ANOMALY — détection automatique d'incidents majeurs par spike de
// volume de tickets.
//
// Principe :
//   1. Pour chaque fenêtre de 15 min, on compte les tickets créés par
//      (organizationId, categoryId).
//   2. On compare ce compte au BASELINE du même couple (org, cat) sur les
//      4 dernières semaines, même jour de semaine, même tranche horaire
//      (mean + stddev).
//   3. Si count > mean + 3σ ET count >= ANOMALY_MIN_ABSOLUTE, c'est une
//      anomalie.
//   4. On crée un ticket INTERNE Cetix "Incident potentiel détecté"
//      regroupant les N tickets anormaux + diagnostic sommaire.
//
// 100% autonome. Détection typique : 5 tickets "VPN timeout" de 3 clients
// différents en 10 min → bug côté fournisseur Internet local.
// ============================================================================

import prisma from "@/lib/prisma";

const WINDOW_MS = 15 * 60_000;
const BASELINE_WEEKS = 4;
const BASELINE_TOLERANCE_STDDEV = 3;
const ANOMALY_MIN_ABSOLUTE = Number(
  process.env.VOLUME_ANOMALY_MIN || 4,
);
const DEDUP_WINDOW_MS = 2 * 60 * 60_000; // 2h — n'ouvre pas un 2e ticket sur la même combo

interface AnomalyCandidate {
  organizationId: string | null;
  categoryId: string | null;
  count: number;
  baselineMean: number;
  baselineStd: number;
  zScore: number;
  ticketIds: string[];
  organizationName: string | null;
  categoryName: string | null;
}

export async function detectVolumeAnomalies(): Promise<{
  checked: number;
  flagged: number;
  incidentsCreated: number;
}> {
  const stats = { checked: 0, flagged: 0, incidentsCreated: 0 };

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  // Compte les tickets dans la fenêtre courante, groupés par (org, category).
  // On ne considère que les tickets créés par humain (source IN portail/email)
  // — les tickets MONITORING ont leur propre pipeline d'alertes.
  const recent = await prisma.ticket.groupBy({
    by: ["organizationId", "categoryId"],
    where: {
      createdAt: { gte: windowStart, lte: now },
      source: { notIn: ["MONITORING", "AUTOMATION"] },
      isInternal: false,
    },
    _count: { _all: true },
  });

  const candidates: AnomalyCandidate[] = [];

  for (const g of recent) {
    stats.checked++;
    if (g._count._all < ANOMALY_MIN_ABSOLUTE) continue;

    // Baseline : sur les 4 semaines précédentes, même plage horaire
    // (±30 min), même jour de la semaine. On prend 4 échantillons pour
    // le mean/stddev.
    const samples: number[] = [];
    for (let w = 1; w <= BASELINE_WEEKS; w++) {
      const weekAgoStart = new Date(
        windowStart.getTime() - w * 7 * 24 * 3600_000,
      );
      const weekAgoEnd = new Date(now.getTime() - w * 7 * 24 * 3600_000);
      const sampleCount = await prisma.ticket.count({
        where: {
          organizationId: g.organizationId,
          categoryId: g.categoryId,
          createdAt: { gte: weekAgoStart, lte: weekAgoEnd },
          source: { notIn: ["MONITORING", "AUTOMATION"] },
          isInternal: false,
        },
      });
      samples.push(sampleCount);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance =
      samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    const stddev = Math.sqrt(variance);
    // Avec 0 historique (nouvelle catégorie), stddev = 0 → z infini.
    // On applique un stddev minimum de 1 pour éviter les faux positifs.
    const effectiveStd = Math.max(stddev, 1);
    const z = (g._count._all - mean) / effectiveStd;

    if (z < BASELINE_TOLERANCE_STDDEV) continue;
    if (g._count._all - mean < 2) continue; // absolu min : +2 tickets vs baseline

    // Anomalie potentielle — collecte les ids des tickets concernés pour le
    // ticket interne.
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId: g.organizationId,
        categoryId: g.categoryId,
        createdAt: { gte: windowStart, lte: now },
        source: { notIn: ["MONITORING", "AUTOMATION"] },
        isInternal: false,
      },
      select: {
        id: true,
        number: true,
        subject: true,
        organization: { select: { name: true } },
        category: { select: { name: true } },
      },
      take: 20,
    });

    candidates.push({
      organizationId: g.organizationId,
      categoryId: g.categoryId,
      count: g._count._all,
      baselineMean: Math.round(mean * 10) / 10,
      baselineStd: Math.round(stddev * 10) / 10,
      zScore: Math.round(z * 10) / 10,
      ticketIds: tickets.map((t) => t.id),
      organizationName: tickets[0]?.organization?.name ?? null,
      categoryName: tickets[0]?.category?.name ?? null,
    });
    stats.flagged++;
  }

  if (candidates.length === 0) return stats;

  // Création des tickets internes avec dédup.
  stats.incidentsCreated = await createAnomalyIncidents(candidates);
  return stats;
}

async function createAnomalyIncidents(
  candidates: AnomalyCandidate[],
): Promise<number> {
  let created = 0;

  // Organisation Cetix (interne) pour rattacher les tickets d'anomalie.
  const cetix = await prisma.organization.findFirst({
    where: { isInternal: true },
    select: { id: true },
  });
  if (!cetix) {
    console.warn("[volume-anomaly] pas d'organisation interne trouvée — skip");
    return 0;
  }

  // System user — créateur technique des tickets automatiques.
  const systemUser = await prisma.user.findFirst({
    where: { OR: [{ email: "system@nexus.local" }, { role: "SUPER_ADMIN" }] },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!systemUser) {
    console.warn("[volume-anomaly] pas de user système disponible — skip");
    return 0;
  }

  for (const a of candidates) {
    // Dédup : a-t-on déjà créé un ticket d'anomalie pour ce couple dans
    // les 2 dernières heures ? Si oui, on ne redouble pas.
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
    const already = await prisma.ticket.findFirst({
      where: {
        isInternal: true,
        source: "AUTOMATION",
        createdAt: { gte: cutoff },
        subject: {
          contains: `[ANOMALIE] ${a.organizationName ?? "?"} — ${a.categoryName ?? "?"}`,
        },
      },
      select: { id: true },
    });
    if (already) continue;

    const ticketList = a.ticketIds
      .slice(0, 10)
      .map((id) => `- ticket:${id}`)
      .join("\n");
    const body = `Volume inhabituel détecté automatiquement.

Client : ${a.organizationName ?? "(non identifié)"}
Catégorie : ${a.categoryName ?? "(non catégorisée)"}
Fenêtre : ${WINDOW_MS / 60000} min

Tickets créés : ${a.count}
Baseline historique (même jour/heure, 4 semaines passées) : ${a.baselineMean} ± ${a.baselineStd}
Score z : ${a.zScore}

Tickets concernés :
${ticketList}

Hypothèse : problème systémique affectant plusieurs utilisateurs. À investiguer et escalader en incident majeur si confirmé.`;

    try {
      await prisma.ticket.create({
        data: {
          subject: `[ANOMALIE] ${a.organizationName ?? "?"} — ${a.categoryName ?? "?"} (${a.count} tickets)`,
          description: body,
          organizationId: cetix.id,
          creatorId: systemUser.id,
          status: "NEW",
          priority: a.count >= 8 ? "HIGH" : "MEDIUM",
          type: "INCIDENT",
          source: "AUTOMATION",
          isInternal: true,
        },
      });
      created++;
      console.log(
        `[volume-anomaly] incident créé : ${a.organizationName} / ${a.categoryName} (${a.count} tickets, z=${a.zScore})`,
      );
    } catch (err) {
      console.warn("[volume-anomaly] création ticket échouée:", err);
    }
  }

  return created;
}
