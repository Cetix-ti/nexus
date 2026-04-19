// ============================================================================
// RECURRING TICKETS — détecte les tickets qui se répètent dans le temps
// chez le même client (signal de root-cause manquant).
//
// Algorithme :
//   1. Pour chaque organisation active, récupère les tickets résolus des
//      12 derniers mois avec embedding.
//   2. Clustering naïf par cosine ≥ 0.85 : tickets sémantiquement proches
//      sont regroupés.
//   3. Un cluster est "récurrent" si :
//      - ≥ 3 tickets dans le cluster
//      - Répartis sur ≥ 2 mois (pas un burst d'une semaine)
//   4. Pour chaque cluster récurrent, on stocke un pattern :
//      AiPattern(scope="recurring:<orgId>", kind="pattern",
//                key="<hash>", value={ subjects, dates, clusterSize })
//
// Utilisation :
//   - Dans response_assist : affiche "C'est la Nème fois ce trimestre"
//   - Dans /tickets/[id] : widget "Ticket récurrent — envisager root-cause"
//   - Rapports mensuels : liste les patterns récurrents pour conseil client
//
// 100% autonome — alimenté par les embeddings déjà calculés.
// ============================================================================

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { cosineSim } from "@/lib/ai/embeddings";
import crypto from "node:crypto";

const SIM_THRESHOLD = 0.85;
const MIN_CLUSTER_SIZE = 3;
const MIN_SPAN_DAYS = 60;
const LOOKBACK_DAYS = 365;

interface RecurringPattern {
  clusterSize: number;
  firstSeen: Date;
  lastSeen: Date;
  spanDays: number;
  avgGapDays: number;
  ticketIds: string[];
  exampleSubjects: string[];
  medoidEmbedding: number[]; // représentant du cluster
}

export async function detectRecurringTickets(): Promise<{
  orgs: number;
  patterns: number;
  skipped: number;
}> {
  const stats = { orgs: 0, patterns: 0, skipped: 0 };

  const orgs = await prisma.organization.findMany({
    where: { isActive: true, isInternal: false },
    select: { id: true, name: true },
  });

  for (const org of orgs) {
    stats.orgs++;
    const patterns = await detectForOrg(org.id);
    for (const p of patterns) {
      // Clé stable : hash du plus ancien ticketId du cluster (idempotent
      // si on re-tourne le job — le même cluster garde la même clé).
      const key = crypto
        .createHash("sha256")
        .update(p.ticketIds.slice().sort()[0])
        .digest("hex")
        .slice(0, 16);
      try {
        await prisma.aiPattern.upsert({
          where: {
            scope_kind_key: {
              scope: `recurring:${org.id}`,
              kind: "pattern",
              key,
            },
          },
          create: {
            scope: `recurring:${org.id}`,
            kind: "pattern",
            key,
            value: {
              clusterSize: p.clusterSize,
              firstSeen: p.firstSeen.toISOString(),
              lastSeen: p.lastSeen.toISOString(),
              spanDays: p.spanDays,
              avgGapDays: Math.round(p.avgGapDays),
              ticketIds: p.ticketIds,
              exampleSubjects: p.exampleSubjects,
              medoid: p.medoidEmbedding,
            } as never,
            sampleCount: p.clusterSize,
            confidence: Math.min(1, p.clusterSize / 8),
          },
          update: {
            value: {
              clusterSize: p.clusterSize,
              firstSeen: p.firstSeen.toISOString(),
              lastSeen: p.lastSeen.toISOString(),
              spanDays: p.spanDays,
              avgGapDays: Math.round(p.avgGapDays),
              ticketIds: p.ticketIds,
              exampleSubjects: p.exampleSubjects,
              medoid: p.medoidEmbedding,
            } as never,
            sampleCount: p.clusterSize,
            confidence: Math.min(1, p.clusterSize / 8),
          },
        });
        stats.patterns++;
      } catch (err) {
        console.warn(`[recurring] upsert failed for org ${org.id}:`, err);
      }
    }
  }

  // Marque les patterns qui n'ont plus été détectés comme obsolètes
  // (stale — on ne les efface pas pour l'historique mais confidence baisse).
  const staleBefore = new Date(Date.now() - 7 * 24 * 3600_000);
  const updated = await prisma.aiPattern.updateMany({
    where: {
      scope: { startsWith: "recurring:" },
      kind: "pattern",
      lastUpdatedAt: { lt: staleBefore },
    },
    data: { confidence: 0.1 },
  });
  stats.skipped = updated.count;

  return stats;
}

async function detectForOrg(orgId: string): Promise<RecurringPattern[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);
  const tickets = await prisma.ticket.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["RESOLVED", "CLOSED"] },
      closedAt: { gte: since },
      NOT: { embedding: { equals: Prisma.DbNull } },
    },
    select: {
      id: true,
      subject: true,
      closedAt: true,
      resolvedAt: true,
      embedding: true,
    },
    take: 300,
    orderBy: { closedAt: "asc" },
  });

  if (tickets.length < MIN_CLUSTER_SIZE) return [];

  // Clustering naïf O(n²) — n <= 300 donc 90k comparaisons, ~5 ms.
  type Entry = {
    id: string;
    subject: string;
    vec: number[];
    date: Date;
    cluster: number;
  };
  const entries: Entry[] = [];
  for (const t of tickets) {
    if (!Array.isArray(t.embedding)) continue;
    entries.push({
      id: t.id,
      subject: t.subject,
      vec: t.embedding as number[],
      date: t.closedAt ?? t.resolvedAt ?? new Date(),
      cluster: -1,
    });
  }

  let nextCluster = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].cluster !== -1) continue;
    entries[i].cluster = nextCluster;
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[j].cluster !== -1) continue;
      if (cosineSim(entries[i].vec, entries[j].vec) >= SIM_THRESHOLD) {
        entries[j].cluster = nextCluster;
      }
    }
    nextCluster++;
  }

  // Regroupe par cluster et filtre
  const byCluster = new Map<number, Entry[]>();
  for (const e of entries) {
    const arr = byCluster.get(e.cluster) ?? [];
    arr.push(e);
    byCluster.set(e.cluster, arr);
  }

  const patterns: RecurringPattern[] = [];
  for (const [, items] of byCluster) {
    if (items.length < MIN_CLUSTER_SIZE) continue;
    const dates = items.map((i) => i.date).sort((a, b) => a.getTime() - b.getTime());
    const spanMs = dates[dates.length - 1].getTime() - dates[0].getTime();
    const spanDays = spanMs / (24 * 3600_000);
    if (spanDays < MIN_SPAN_DAYS) continue;

    // Medoid = ticket dont la somme des cosines avec les autres est maximale.
    // Représentant canonique pour comparaisons futures.
    let medoidIdx = 0;
    let bestSim = -Infinity;
    for (let i = 0; i < items.length; i++) {
      let s = 0;
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        s += cosineSim(items[i].vec, items[j].vec);
      }
      if (s > bestSim) {
        bestSim = s;
        medoidIdx = i;
      }
    }

    // Gap moyen entre occurrences
    let totalGap = 0;
    for (let i = 1; i < dates.length; i++) {
      totalGap += (dates[i].getTime() - dates[i - 1].getTime()) / (24 * 3600_000);
    }
    const avgGapDays = totalGap / (dates.length - 1);

    patterns.push({
      clusterSize: items.length,
      firstSeen: dates[0],
      lastSeen: dates[dates.length - 1],
      spanDays: Math.round(spanDays),
      avgGapDays,
      ticketIds: items.map((i) => i.id),
      exampleSubjects: items.slice(0, 3).map((i) => i.subject),
      medoidEmbedding: items[medoidIdx].vec,
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Helper public — à appeler depuis les features pour savoir si un ticket
// fait partie d'un pattern récurrent. Retourne un résumé court à injecter
// dans un prompt ou une UI.
// ---------------------------------------------------------------------------

export async function getRecurringPatternForTicket(
  ticketId: string,
): Promise<{
  isRecurring: boolean;
  clusterSize: number;
  spanDays: number;
  avgGapDays: number;
  patternId: string | null;
} | null> {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { organizationId: true, embedding: true },
  });
  if (!t || !Array.isArray(t.embedding)) return null;
  const vec = t.embedding as number[];

  const patterns = await prisma.aiPattern.findMany({
    where: {
      scope: `recurring:${t.organizationId}`,
      kind: "pattern",
      confidence: { gte: 0.3 }, // ignore les stales
    },
    select: { id: true, value: true, sampleCount: true },
  });

  for (const p of patterns) {
    const v = p.value as { medoid?: unknown; spanDays?: number; avgGapDays?: number } | null;
    if (!v || !Array.isArray(v.medoid)) continue;
    const sim = cosineSim(vec, v.medoid as number[]);
    if (sim >= SIM_THRESHOLD) {
      return {
        isRecurring: true,
        clusterSize: p.sampleCount,
        spanDays: v.spanDays ?? 0,
        avgGapDays: v.avgGapDays ?? 0,
        patternId: p.id,
      };
    }
  }
  return null;
}
