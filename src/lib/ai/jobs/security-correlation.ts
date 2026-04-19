// ============================================================================
// SECURITY CORRELATION CHAIN — corrèle automatiquement les incidents de
// sécurité qui partagent une entité (endpoint, userPrincipal, organisation)
// dans une fenêtre temporelle proche, même s'ils viennent de sources
// différentes (Wazuh, Bitdefender, Active Directory, etc.).
//
// Cas d'usage concret :
//   - 14h02 — AD : account_lockout sur jdoe@acme.local
//   - 14h05 — Wazuh : brute_force SSH sur SRV-DC01 (IP source 203.0.113.42)
//   - 14h07 — Bitdefender : malware_detected sur poste WKS-JDOE
//   - 14h15 — AD : password_reset jdoe@acme.local
//
//   Tout cela concerne le compte jdoe : c'est une CHAÎNE D'ATTAQUE qui
//   mérite un ticket agrégé "Compromission probable de jdoe", plutôt que
//   4 tickets dispersés traités isolément.
//
// Algorithme :
//   1. Sélectionne tous les SecurityIncidents ouverts des 48 dernières heures.
//   2. Pour chaque paire d'incidents, calcule un "affinity score" :
//       +3 si même endpoint
//       +3 si même userPrincipal
//       +1 si même organization
//       +2 si proximité temporelle < 30 min
//       +1 si proximité temporelle < 4h
//       +1 si sources différentes (corroboration cross-source)
//   3. Clusters connexes avec score ≥ 4 → une chaîne.
//   4. Écrit dans AiPattern(scope="security:correlation", kind="chain").
//   5. Le widget PersistenceView ou l'UI incidents peut afficher "3 incidents
//      corrélés détectés" avec bouton pour fusionner en ticket unique.
//
// Pas de LLM — purement algorithmique. Coût DB modéré (O(N²) sur ≤ 200
// incidents ouverts typiquement).
// ============================================================================

import prisma from "@/lib/prisma";
import { createHash } from "crypto";

const LOOKBACK_HOURS = 48;
const MIN_AFFINITY = 4;
const TIME_CLOSE_MS = 30 * 60_000;
const TIME_NEAR_MS = 4 * 60 * 60_000;

interface IncidentLite {
  id: string;
  source: string;
  kind: string;
  severity: string | null;
  organizationId: string | null;
  endpoint: string | null;
  userPrincipal: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  title: string;
}

interface Chain {
  chainId: string;
  incidentIds: string[];
  organizationId: string | null;
  entities: {
    endpoints: string[];
    users: string[];
  };
  sources: string[];
  timeSpanMs: number;
  highestSeverity: string | null;
  summary: string;
  detectedAt: string;
}

export async function detectSecurityCorrelations(): Promise<{
  incidentsScanned: number;
  chainsDetected: number;
  chainsWritten: number;
}> {
  const stats = { incidentsScanned: 0, chainsDetected: 0, chainsWritten: 0 };
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000);

  const incidents = (await prisma.securityIncident.findMany({
    where: {
      status: { in: ["open", "investigating", "waiting_client"] },
      lastSeenAt: { gte: since },
    },
    select: {
      id: true,
      source: true,
      kind: true,
      severity: true,
      organizationId: true,
      endpoint: true,
      userPrincipal: true,
      firstSeenAt: true,
      lastSeenAt: true,
      title: true,
    },
  })) as IncidentLite[];
  stats.incidentsScanned = incidents.length;
  if (incidents.length < 2) return stats;

  // 1. Construit le graphe d'affinité (O(N²)).
  //    adjacency[i] = liste des j (j > i) avec score ≥ MIN_AFFINITY.
  const edges: Array<{ a: number; b: number; score: number }> = [];
  for (let i = 0; i < incidents.length; i++) {
    for (let j = i + 1; j < incidents.length; j++) {
      const score = affinityScore(incidents[i], incidents[j]);
      if (score >= MIN_AFFINITY) edges.push({ a: i, b: j, score });
    }
  }

  // 2. Union-Find pour extraire les composantes connexes.
  const parent = Array.from({ length: incidents.length }, (_, i) => i);
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
  for (const e of edges) union(e.a, e.b);

  // 3. Groupe par composante.
  const components = new Map<number, number[]>();
  for (let i = 0; i < incidents.length; i++) {
    const root = find(i);
    const list = components.get(root) ?? [];
    list.push(i);
    components.set(root, list);
  }

  // 4. Filtre : au moins 2 incidents ET au moins 2 sources différentes.
  const chains: Chain[] = [];
  for (const idxs of components.values()) {
    if (idxs.length < 2) continue;
    const incs = idxs.map((i) => incidents[i]);
    const sources = new Set(incs.map((x) => x.source));
    if (sources.size < 2) continue;

    const endpoints = Array.from(
      new Set(incs.map((x) => x.endpoint).filter((x): x is string => !!x)),
    );
    const users = Array.from(
      new Set(incs.map((x) => x.userPrincipal).filter((x): x is string => !!x)),
    );
    const orgIds = Array.from(
      new Set(incs.map((x) => x.organizationId).filter((x): x is string => !!x)),
    );

    const minTime = Math.min(...incs.map((x) => x.firstSeenAt.getTime()));
    const maxTime = Math.max(...incs.map((x) => x.lastSeenAt.getTime()));
    const severities = ["critical", "high", "warning", "info"];
    const highestSeverity =
      severities.find((s) => incs.some((x) => x.severity === s)) ?? null;

    // Chain ID stable : hash trié des incident IDs (idempotent).
    const sortedIds = incs.map((x) => x.id).sort();
    const chainId = createHash("sha256")
      .update(sortedIds.join("|"))
      .digest("hex")
      .slice(0, 16);

    const summaryEntity =
      endpoints.length > 0
        ? `endpoint ${endpoints.slice(0, 2).join(", ")}`
        : users.length > 0
          ? `compte ${users.slice(0, 2).join(", ")}`
          : "entité commune";

    chains.push({
      chainId,
      incidentIds: sortedIds,
      organizationId: orgIds[0] ?? null,
      entities: { endpoints, users },
      sources: Array.from(sources),
      timeSpanMs: maxTime - minTime,
      highestSeverity,
      summary: `${incs.length} incident(s) de sécurité corrélés (${Array.from(sources).join(", ")}) sur ${summaryEntity}`,
      detectedAt: new Date().toISOString(),
    });
  }
  stats.chainsDetected = chains.length;

  // 5. Upsert dans AiPattern.
  for (const c of chains) {
    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "security:correlation",
            kind: "chain",
            key: c.chainId,
          },
        },
        create: {
          scope: "security:correlation",
          kind: "chain",
          key: c.chainId,
          value: c as never,
          sampleCount: c.incidentIds.length,
          confidence: Math.min(1, c.incidentIds.length / 5),
        },
        update: {
          value: c as never,
          sampleCount: c.incidentIds.length,
          confidence: Math.min(1, c.incidentIds.length / 5),
        },
      });
      stats.chainsWritten++;
    } catch (err) {
      console.warn(`[security-correlation] upsert failed for ${c.chainId}:`, err);
    }
  }

  // 6. Nettoyage : chains dont tous les incidents sont fermés/résolus
  //    depuis plus de 7 jours → suppression pour éviter l'accumulation.
  const staleSince = new Date(Date.now() - 7 * 24 * 3600_000);
  const allChains = await prisma.aiPattern.findMany({
    where: { scope: "security:correlation", kind: "chain" },
    select: { id: true, key: true, value: true, lastUpdatedAt: true },
  });
  const activeIds = new Set(chains.map((c) => c.chainId));
  const toDelete: string[] = [];
  for (const ch of allChains) {
    if (activeIds.has(ch.key)) continue;
    if (ch.lastUpdatedAt > staleSince) continue;
    toDelete.push(ch.id);
  }
  if (toDelete.length > 0) {
    await prisma.aiPattern.deleteMany({ where: { id: { in: toDelete } } });
  }

  return stats;
}

function affinityScore(a: IncidentLite, b: IncidentLite): number {
  let score = 0;
  if (a.endpoint && b.endpoint && a.endpoint === b.endpoint) score += 3;
  if (a.userPrincipal && b.userPrincipal && a.userPrincipal === b.userPrincipal)
    score += 3;
  if (
    a.organizationId &&
    b.organizationId &&
    a.organizationId === b.organizationId
  )
    score += 1;

  // Proximité temporelle : prend le delta le plus petit parmi les 4
  // combinaisons first/last.
  const deltas = [
    Math.abs(a.firstSeenAt.getTime() - b.firstSeenAt.getTime()),
    Math.abs(a.firstSeenAt.getTime() - b.lastSeenAt.getTime()),
    Math.abs(a.lastSeenAt.getTime() - b.firstSeenAt.getTime()),
    Math.abs(a.lastSeenAt.getTime() - b.lastSeenAt.getTime()),
  ];
  const minDelta = Math.min(...deltas);
  if (minDelta < TIME_CLOSE_MS) score += 2;
  else if (minDelta < TIME_NEAR_MS) score += 1;

  if (a.source !== b.source) score += 1;

  return score;
}

// ---------------------------------------------------------------------------
// Helper public — récupère les chaînes qui incluent un incident donné.
// Utilisé par l'UI incident pour afficher "Corrélations détectées".
// ---------------------------------------------------------------------------

export async function getCorrelationChainsForIncident(
  incidentId: string,
): Promise<Chain[]> {
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "security:correlation", kind: "chain" },
    select: { value: true },
  });
  const chains: Chain[] = [];
  for (const r of rows) {
    const v = r.value as Partial<Chain> | null;
    if (!v || !Array.isArray(v.incidentIds)) continue;
    if (!v.incidentIds.includes(incidentId)) continue;
    if (typeof v.chainId !== "string" || !v.chainId) continue;
    chains.push(v as Chain);
  }
  return chains;
}
