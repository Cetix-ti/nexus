// ============================================================================
// AGGREGATOR — collecte de signaux opérationnels pour une organisation
// sur une fenêtre de temps. Utilisé par :
//   - risk-analysis (Phase 3 #8)
//   - monthly-report (Phase 3 #11)
//   - sales-suggest (Phase 3 #9)
//
// L'idée : un seul endroit qui sait comment lire la DB pour produire un
// snapshot opérationnel. Évite que chaque feature duplique la logique.
// Les données sont déjà agrégées / comptées — on envoie des chiffres à
// l'IA, pas des centaines de lignes brutes. Réduit les tokens + améliore
// la précision des synthèses.
// ============================================================================

import prisma from "@/lib/prisma";

export interface OrgSignals {
  organizationId: string;
  organizationName: string;
  sinceDays: number;
  /** Compteurs de tickets par catégorie, statut, type, priorité. */
  tickets: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    byCategory: Array<{ name: string; count: number }>;
    topSubjects: string[];
    /** Tickets encore OUVERTS au moment du snapshot. */
    stillOpen: number;
    slaBreached: number;
    escalated: number;
    avgResolutionHours: number | null;
    /** Évolution sur la période précédente de même durée. */
    trendVsPrevious: number | null;
  };
  /** Alertes monitoring (Zabbix/Atera/Fortigate). */
  monitoring: {
    total: number;
    bySeverity: Record<string, number>;
    bySource: Record<string, number>;
    unresolved: number;
    topHosts: Array<{ host: string; count: number }>;
  };
  /** Incidents de sécurité (Wazuh/Bitdefender/AD). */
  security: {
    total: number;
    byKind: Record<string, number>;
    bySeverity: Record<string, number>;
    topEndpoints: Array<{ endpoint: string; count: number }>;
  };
  /** Sauvegardes Veeam. */
  backups: {
    total: number;
    failed: number;
    warning: number;
    success: number;
    topFailingJobs: Array<{ job: string; count: number }>;
  };
  /** Assets RMM (Atera) — age du parc, patches, EOL. */
  assets: {
    total: number;
    byType: Record<string, number>;
    warrantyExpired: number;
    warrantyExpiringSoon: number;
  };
  /** Faits extraits antérieurement (AiMemory scope=org:xxx). */
  extractedFacts: Array<{
    kind: string;
    content: string;
    verified: boolean;
  }>;
}

export async function collectOrgSignals(args: {
  organizationId: string;
  sinceDays?: number;
}): Promise<OrgSignals | null> {
  const sinceDays = args.sinceDays ?? 60;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const prevSince = new Date(
    Date.now() - 2 * sinceDays * 24 * 60 * 60 * 1000,
  );

  const org = await prisma.organization.findUnique({
    where: { id: args.organizationId },
    select: { id: true, name: true },
  });
  if (!org) return null;

  const [
    tickets,
    prevTickets,
    monitoring,
    security,
    backups,
    assets,
    facts,
  ] = await Promise.all([
    // Tickets courants (fenêtre actuelle)
    prisma.ticket.findMany({
      where: {
        organizationId: org.id,
        createdAt: { gte: since },
      },
      select: {
        id: true,
        subject: true,
        status: true,
        priority: true,
        type: true,
        slaBreached: true,
        isEscalated: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
        category: { select: { name: true } },
      },
    }),
    // Tickets fenêtre précédente (pour calcul tendance)
    prisma.ticket.count({
      where: {
        organizationId: org.id,
        createdAt: { gte: prevSince, lt: since },
      },
    }),
    prisma.monitoringAlert.findMany({
      where: { organizationId: org.id, receivedAt: { gte: since } },
      select: {
        severity: true,
        sourceType: true,
        subject: true,
        isResolved: true,
        alertGroupKey: true,
      },
    }),
    prisma.securityIncident.findMany({
      where: { organizationId: org.id, lastSeenAt: { gte: since } },
      select: {
        kind: true,
        severity: true,
        endpoint: true,
      },
    }),
    prisma.veeamBackupAlert.findMany({
      where: { organizationId: org.id, receivedAt: { gte: since } },
      select: { status: true, jobName: true },
    }),
    prisma.asset.findMany({
      where: { organizationId: org.id },
      select: {
        type: true,
        warrantyExpiry: true,
      },
    }),
    prisma.aiMemory.findMany({
      where: {
        scope: `org:${org.id}`,
        // Ignore les faits explicitement rejetés par un admin — ils sont
        // conservés pour éviter la re-extraction mais ne doivent pas
        // polluer le contexte IA. Les faits en attente (verifiedAt=null)
        // sont inclus MAIS seront marqués "non vérifiés" côté prompt
        // pour que l'IA sache qu'ils sont moins fiables.
        rejectedAt: null,
      },
      select: {
        category: true,
        content: true,
        verifiedAt: true,
      },
      take: 30,
    }),
  ]);

  // ---- Tickets -----------------------------------------------------------
  const byStatus = countBy(tickets, (t) => t.status);
  const byPriority = countBy(tickets, (t) => t.priority);
  const byType = countBy(tickets, (t) => t.type);
  const catCounts = new Map<string, number>();
  for (const t of tickets) {
    const name = t.category?.name ?? "(sans catégorie)";
    catCounts.set(name, (catCounts.get(name) ?? 0) + 1);
  }
  const byCategory = Array.from(catCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topSubjects = tickets
    .slice()
    .sort((a, b) => +b.createdAt - +a.createdAt)
    .slice(0, 15)
    .map((t) => t.subject.slice(0, 100));

  const stillOpen = tickets.filter(
    (t) =>
      !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status.toUpperCase()),
  ).length;
  const slaBreached = tickets.filter((t) => t.slaBreached).length;
  const escalated = tickets.filter((t) => t.isEscalated).length;

  const resolvedTickets = tickets.filter((t) => t.resolvedAt);
  const avgResolutionHours =
    resolvedTickets.length > 0
      ? Math.round(
          (resolvedTickets.reduce((acc, t) => {
            return (
              acc +
              (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3_600_000
            );
          }, 0) /
            resolvedTickets.length) *
            10,
        ) / 10
      : null;

  const trendVsPrevious =
    prevTickets > 0
      ? Math.round(((tickets.length - prevTickets) / prevTickets) * 100)
      : null;

  // ---- Monitoring --------------------------------------------------------
  const monSeverity = countBy(monitoring, (a) => a.severity);
  const monSource = countBy(monitoring, (a) => a.sourceType);
  const monUnresolved = monitoring.filter((a) => !a.isResolved).length;
  // top hosts par alertGroupKey — segment 2 = host (format "src:host:desc")
  const hostCounts = new Map<string, number>();
  for (const m of monitoring) {
    const host = m.alertGroupKey?.split(":")[1];
    if (!host || host === "unknown") continue;
    hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
  }
  const topHosts = Array.from(hostCounts.entries())
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ---- Security ----------------------------------------------------------
  const secKind = countBy(security, (s) => s.kind);
  const secSev = countBy(security, (s) =>
    typeof s.severity === "string" ? s.severity : "unknown",
  );
  const secEndpoints = new Map<string, number>();
  for (const s of security) {
    if (!s.endpoint) continue;
    secEndpoints.set(s.endpoint, (secEndpoints.get(s.endpoint) ?? 0) + 1);
  }
  const topSecEndpoints = Array.from(secEndpoints.entries())
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ---- Backups -----------------------------------------------------------
  const jobFailCounts = new Map<string, number>();
  for (const b of backups) {
    if (b.status !== "FAILED") continue;
    jobFailCounts.set(b.jobName, (jobFailCounts.get(b.jobName) ?? 0) + 1);
  }
  const topFailingJobs = Array.from(jobFailCounts.entries())
    .map(([job, count]) => ({ job, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ---- Assets ------------------------------------------------------------
  const byAssetType = countBy(assets, (a) => a.type);
  const now = Date.now();
  const soon = now + 90 * 24 * 60 * 60 * 1000;
  const warrantyExpired = assets.filter(
    (a) => a.warrantyExpiry && a.warrantyExpiry.getTime() < now,
  ).length;
  const warrantyExpiringSoon = assets.filter(
    (a) =>
      a.warrantyExpiry &&
      a.warrantyExpiry.getTime() >= now &&
      a.warrantyExpiry.getTime() <= soon,
  ).length;

  return {
    organizationId: org.id,
    organizationName: org.name,
    sinceDays,
    tickets: {
      total: tickets.length,
      byStatus,
      byPriority,
      byType,
      byCategory,
      topSubjects,
      stillOpen,
      slaBreached,
      escalated,
      avgResolutionHours,
      trendVsPrevious,
    },
    monitoring: {
      total: monitoring.length,
      bySeverity: monSeverity,
      bySource: monSource,
      unresolved: monUnresolved,
      topHosts,
    },
    security: {
      total: security.length,
      byKind: secKind,
      bySeverity: secSev,
      topEndpoints: topSecEndpoints,
    },
    backups: {
      total: backups.length,
      failed: backups.filter((b) => b.status === "FAILED").length,
      warning: backups.filter((b) => b.status === "WARNING").length,
      success: backups.filter((b) => b.status === "SUCCESS").length,
      topFailingJobs,
    },
    assets: {
      total: assets.length,
      byType: byAssetType,
      warrantyExpired,
      warrantyExpiringSoon,
    },
    extractedFacts: facts.map((f) => ({
      kind: f.category,
      content: f.content,
      verified: f.verifiedAt != null,
    })),
  };
}

function countBy<T>(
  items: T[],
  keyFn: (t: T) => string | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = keyFn(item);
    if (!k) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
