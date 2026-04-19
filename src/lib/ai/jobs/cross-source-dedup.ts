// ============================================================================
// CROSS-SOURCE DEDUP — détecte qu'un MÊME INCIDENT RÉEL a généré plusieurs
// tickets venant de sources différentes (monitoring, email, portail, etc.)
// et les GROUPE en cluster pour réduire la fatigue d'alerte.
//
// Cas d'usage typique chez un MSP :
//   - 09h12 — Zabbix : "SRV-EX02 ping timeout" → ticket MONITORING
//   - 09h14 — user email : "je n'ai plus mes courriels" → ticket EMAIL
//   - 09h15 — Wazuh : network_anomaly sur SRV-EX02 → ticket MONITORING
//   - 09h18 — user portal : "Outlook plante" → ticket PORTAL
//
//   4 tickets, 1 seul incident réel. Sans groupement, 4 techs traitent en
//   parallèle. Avec groupement : 1 cluster visible, 1 tech assigné, les
//   autres tickets sont marqués "duplicate" automatiquement.
//
// Signaux d'appariement (score cumulé) :
//   +4 embedding cosine ≥ 0.80 (très fort)
//   +2 embedding cosine ∈ [0.65, 0.80)
//   +3 même hostname extrait du subject/description
//   +3 même adresse IP
//   +2 même requester email
//   +1 même organisation
//   +2 proximité temporelle ≤ 15 min
//   +1 proximité temporelle ≤ 60 min
//   +1 sources DIFFÉRENTES (un vrai incident multi-source est plus probable)
//
// Seuil de cluster : score ≥ 5 OU embedding cosine ≥ 0.85 seul.
//
// Stockage : AiPattern(scope="dedup:cluster", kind="group", key=<hash des ids>).
// Valeur : {ticketIds, masterTicketId, signals, confidence, detectedAt}.
//
// NE MODIFIE PAS les tickets. C'est un MÉTADONNÉE consultable — la décision
// de vraiment fusionner reste humaine (bouton dans un widget).
// ============================================================================

import prisma from "@/lib/prisma";
import { createHash } from "crypto";
import { cosineSim } from "@/lib/ai/embeddings";

const LOOKBACK_HOURS = 8;
const MIN_CLUSTER_SCORE = 5;
const STRONG_COSINE = 0.85;
const MEDIUM_COSINE = 0.65;

interface DedupCluster {
  clusterId: string;
  ticketIds: string[];
  masterTicketId: string;       // le plus ancien = référence
  organizationId: string | null;
  signals: {
    sharedEndpoints: string[];
    sharedIPs: string[];
    sharedRequesters: string[];
    distinctSources: string[];
    maxCosine: number | null;
    timeSpanMinutes: number;
  };
  confidence: number;
  detectedAt: string;
  summary: string;
}

export async function detectCrossSourceDuplicates(): Promise<{
  ticketsScanned: number;
  pairsEvaluated: number;
  clustersDetected: number;
  clustersWritten: number;
}> {
  const stats = {
    ticketsScanned: 0,
    pairsEvaluated: 0,
    clustersDetected: 0,
    clustersWritten: 0,
  };
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000);

  const tickets = await prisma.ticket.findMany({
    where: {
      createdAt: { gte: since },
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
    select: {
      id: true,
      subject: true,
      description: true,
      organizationId: true,
      source: true,
      createdAt: true,
      requesterId: true,
      embedding: true,
      requester: { select: { email: true } },
    },
  });
  stats.ticketsScanned = tickets.length;
  if (tickets.length < 2) return stats;

  // Pré-extraction : hostnames / IPs / requester par ticket — évite de
  // recalculer à chaque paire.
  interface Enriched {
    id: string;
    subject: string;
    organizationId: string;
    source: string;
    createdAt: Date;
    requesterEmail: string | null;
    vec: number[] | null;
    hostnames: Set<string>;
    ips: Set<string>;
  }
  const enriched: Enriched[] = tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    organizationId: t.organizationId,
    source: String(t.source),
    createdAt: t.createdAt,
    requesterEmail: t.requester?.email ?? null,
    vec:
      Array.isArray(t.embedding) && t.embedding.length > 0
        ? (t.embedding as number[])
        : null,
    hostnames: extractHostnames(`${t.subject}\n${t.description ?? ""}`),
    ips: extractIps(`${t.subject}\n${t.description ?? ""}`),
  }));

  // Graphe d'affinité (O(N²)). Pour N=200 tickets → 20k pairs = OK.
  const edges: Array<{
    i: number;
    j: number;
    score: number;
    cosine: number | null;
    shared: {
      endpoints: string[];
      ips: string[];
      requester: string | null;
    };
  }> = [];
  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      const a = enriched[i];
      const b = enriched[j];
      if (a.organizationId !== b.organizationId) continue; // jamais cross-org
      stats.pairsEvaluated++;

      let score = 1; // même org

      // Cosine similarity
      let cosine: number | null = null;
      if (a.vec && b.vec) {
        cosine = cosineSim(a.vec, b.vec);
        if (cosine >= STRONG_COSINE) score += 4;
        else if (cosine >= MEDIUM_COSINE) score += 2;
      }

      // Hostnames partagés
      const sharedHosts: string[] = [];
      for (const h of a.hostnames) if (b.hostnames.has(h)) sharedHosts.push(h);
      if (sharedHosts.length > 0) score += 3;

      // IPs partagées
      const sharedIps: string[] = [];
      for (const ip of a.ips) if (b.ips.has(ip)) sharedIps.push(ip);
      if (sharedIps.length > 0) score += 3;

      // Même requester email
      let sharedReq: string | null = null;
      if (
        a.requesterEmail &&
        b.requesterEmail &&
        a.requesterEmail.toLowerCase() === b.requesterEmail.toLowerCase()
      ) {
        score += 2;
        sharedReq = a.requesterEmail.toLowerCase();
      }

      // Proximité temporelle
      const deltaMin =
        Math.abs(a.createdAt.getTime() - b.createdAt.getTime()) / 60_000;
      if (deltaMin <= 15) score += 2;
      else if (deltaMin <= 60) score += 1;

      // Multi-source
      if (a.source !== b.source) score += 1;

      const pass =
        score >= MIN_CLUSTER_SCORE ||
        (cosine !== null && cosine >= STRONG_COSINE);
      if (!pass) continue;

      edges.push({
        i,
        j,
        score,
        cosine,
        shared: {
          endpoints: sharedHosts,
          ips: sharedIps,
          requester: sharedReq,
        },
      });
    }
  }

  // Union-Find pour extraire les clusters connexes.
  const parent = Array.from({ length: enriched.length }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (const e of edges) union(e.i, e.j);

  // Composantes
  const components = new Map<number, number[]>();
  for (let i = 0; i < enriched.length; i++) {
    const root = find(i);
    const list = components.get(root) ?? [];
    list.push(i);
    components.set(root, list);
  }

  // Construire DedupClusters à partir des composantes ≥ 2.
  const clusters: DedupCluster[] = [];
  for (const idxs of components.values()) {
    if (idxs.length < 2) continue;
    const members = idxs.map((i) => enriched[i]);
    members.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const master = members[0];

    // Agrège les signaux des edges internes à la composante.
    const idxSet = new Set(idxs);
    const internalEdges = edges.filter(
      (e) => idxSet.has(e.i) && idxSet.has(e.j),
    );
    const sharedEndpoints = new Set<string>();
    const sharedIps = new Set<string>();
    const sharedRequesters = new Set<string>();
    let maxCosine: number | null = null;
    let totalScore = 0;
    for (const e of internalEdges) {
      for (const h of e.shared.endpoints) sharedEndpoints.add(h);
      for (const ip of e.shared.ips) sharedIps.add(ip);
      if (e.shared.requester) sharedRequesters.add(e.shared.requester);
      if (e.cosine !== null && (maxCosine === null || e.cosine > maxCosine))
        maxCosine = e.cosine;
      totalScore += e.score;
    }
    const distinctSources = Array.from(new Set(members.map((m) => m.source)));
    const timeSpanMinutes =
      (members[members.length - 1].createdAt.getTime() -
        members[0].createdAt.getTime()) /
      60_000;

    const sortedIds = members.map((m) => m.id).sort();
    const clusterId = createHash("sha256")
      .update(sortedIds.join("|"))
      .digest("hex")
      .slice(0, 16);

    const confidence = Math.min(
      1,
      0.5 + totalScore / (internalEdges.length * 10),
    );

    const summary = `${members.length} ticket(s) probablement identiques : ${distinctSources.join(
      ", ",
    )}${sharedEndpoints.size > 0 ? ` — sur ${Array.from(sharedEndpoints).slice(0, 2).join(", ")}` : ""}`;

    clusters.push({
      clusterId,
      ticketIds: sortedIds,
      masterTicketId: master.id,
      organizationId: master.organizationId ?? null,
      signals: {
        sharedEndpoints: Array.from(sharedEndpoints),
        sharedIPs: Array.from(sharedIps),
        sharedRequesters: Array.from(sharedRequesters),
        distinctSources,
        maxCosine: maxCosine !== null ? Math.round(maxCosine * 1000) / 1000 : null,
        timeSpanMinutes: Math.round(timeSpanMinutes),
      },
      confidence: Math.round(confidence * 1000) / 1000,
      detectedAt: new Date().toISOString(),
      summary,
    });
  }
  stats.clustersDetected = clusters.length;

  // Upsert + nettoyage
  const activeIds = new Set(clusters.map((c) => c.clusterId));
  const existing = await prisma.aiPattern.findMany({
    where: { scope: "dedup:cluster", kind: "group" },
    select: { id: true, key: true, value: true },
  });
  // On laisse persister les clusters récents même s'ils n'apparaissent plus
  // dans la fenêtre de scan — ils restent utiles à l'UI jusqu'à ce que les
  // tickets soient résolus. Purge : clusters où TOUS les tickets sont
  // closed/resolved/cancelled.
  const staleIds: string[] = [];
  for (const r of existing) {
    if (activeIds.has(r.key)) continue;
    const v = r.value as { ticketIds?: string[] } | null;
    if (!v?.ticketIds) {
      staleIds.push(r.id);
      continue;
    }
    const openCount = await prisma.ticket.count({
      where: {
        id: { in: v.ticketIds },
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
      },
    });
    if (openCount === 0) staleIds.push(r.id);
  }
  if (staleIds.length > 0) {
    await prisma.aiPattern.deleteMany({ where: { id: { in: staleIds } } });
  }

  for (const c of clusters) {
    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "dedup:cluster",
            kind: "group",
            key: c.clusterId,
          },
        },
        create: {
          scope: "dedup:cluster",
          kind: "group",
          key: c.clusterId,
          value: c as never,
          sampleCount: c.ticketIds.length,
          confidence: c.confidence,
        },
        update: {
          value: c as never,
          sampleCount: c.ticketIds.length,
          confidence: c.confidence,
        },
      });
      stats.clustersWritten++;
    } catch (err) {
      console.warn(`[dedup] upsert failed for ${c.clusterId}:`, err);
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helpers d'extraction d'entités — volontairement simples, patterns MSP
// classiques. Pas de dépendance NER, zéro coût.
// ---------------------------------------------------------------------------

function extractHostnames(text: string): Set<string> {
  const out = new Set<string>();
  // Pattern classique MSP : SRV-XXX-YY, DC01, WKS-NAME, PROD-ABC.
  const m = text.match(/\b(?:SRV|DC|WKS|NAS|FW|SW|RTR|PROD|APP|DB|EX|FS)-?[A-Z0-9]{2,}(?:-[A-Z0-9]+)*\b/gi);
  if (m) for (const h of m) out.add(h.toUpperCase());
  // FQDN basique : mot.mot.mot
  const fqdn = text.match(/\b[a-z0-9-]+\.[a-z0-9-]+\.[a-z]{2,}\b/gi);
  if (fqdn) for (const h of fqdn) out.add(h.toLowerCase());
  return out;
}

function extractIps(text: string): Set<string> {
  const out = new Set<string>();
  const m = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  if (m) for (const ip of m) {
    // Filtre les adresses clairement non-routables 0.0.0.0 ou version numbers
    if (ip === "0.0.0.0" || ip === "127.0.0.1") continue;
    out.add(ip);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helper public — clusters qui contiennent ce ticket, pour le widget UI.
// ---------------------------------------------------------------------------

export async function getDedupClusterForTicket(
  ticketId: string,
): Promise<DedupCluster | null> {
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "dedup:cluster", kind: "group" },
    select: { value: true },
  });
  for (const r of rows) {
    const v = r.value as Partial<DedupCluster> | null;
    if (!v || !Array.isArray(v.ticketIds)) continue;
    if (!v.ticketIds.includes(ticketId)) continue;
    if (typeof v.clusterId !== "string") continue;
    return v as DedupCluster;
  }
  return null;
}
