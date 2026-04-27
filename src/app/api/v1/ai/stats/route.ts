// ============================================================================
// GET /api/v1/ai/stats
//
// Agrégats sur la table AiInvocation pour le dashboard admin IA.
// Fenêtre par défaut : 30 jours. Query param ?days=N (max 365).
//
// Retourne :
//   - totals: { invocations, costCents, failedRate, acceptanceRate, scrubComplianceRate }
//   - byFeature: [{ feature, count, costCents, avgLatency, p50, p95,
//                   acceptanceRate, drift, providerMix }]
//   - byProvider: { name: { count, costCents } }
//   - byStatus: { ok, error, timeout, blocked }
//   - byDay: [{ day, count, costCents }] — pour sparkline
//   - drift: [{ feature, change, acceptRecent, acceptPrior, decisions }] — alertes
//   - feedback: { categoryDisagreements, similarClicks }
//   - recent: 20 dernières invocations
//
// Réservé SUPERVISOR+ pour éviter l'exposition des coûts à tout le monde.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export async function GET(req: Request) {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  // me reste accessible si besoin via __aiGuard.me
  const url = new URL(req.url);
  const days = Math.min(
    Math.max(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 1),
    365,
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.aiInvocation.findMany({
    where: { createdAt: { gte: since } },
    select: {
      feature: true,
      provider: true,
      modelName: true,
      costCents: true,
      latencyMs: true,
      status: true,
      humanAction: true,
      sensitivityLevel: true,
      scrubApplied: true,
      promptVersion: true,
      createdAt: true,
    },
  });

  // Drift : acceptance sur les 7 derniers jours vs les 8-30 jours précédents.
  // Utile pour détecter une dégradation silencieuse (mauvais modèle pullé,
  // régression de prompt, changement côté provider).
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // ---- Totals ------------------------------------------------------------
  const totalCount = rows.length;
  const totalCostCents = rows.reduce((acc, r) => acc + (r.costCents ?? 0), 0);
  const failedCount = rows.filter(
    (r) => r.status !== "ok" && r.status !== "blocked",
  ).length;
  const decisionsTaken = rows.filter((r) => r.humanAction != null).length;
  const acceptedCount = rows.filter((r) => r.humanAction === "accepted").length;
  const editedCount = rows.filter((r) => r.humanAction === "edited").length;
  const acceptanceRate =
    decisionsTaken > 0
      ? (acceptedCount + editedCount) / decisionsTaken
      : null;

  // ---- Par feature -------------------------------------------------------
  const featureMap = new Map<
    string,
    {
      count: number;
      costCents: number;
      latencies: number[];
      accepts: number;
      decisions: number;
      // Drift : buckets 0-7j et 8-30j séparés
      acceptsRecent: number;
      decisionsRecent: number;
      acceptsPrior: number;
      decisionsPrior: number;
      providerCounts: Record<string, number>;
    }
  >();
  for (const r of rows) {
    const e = featureMap.get(r.feature) ?? {
      count: 0,
      costCents: 0,
      latencies: [],
      accepts: 0,
      decisions: 0,
      acceptsRecent: 0,
      decisionsRecent: 0,
      acceptsPrior: 0,
      decisionsPrior: 0,
      providerCounts: {},
    };
    e.count++;
    e.costCents += r.costCents ?? 0;
    if (r.latencyMs != null) e.latencies.push(r.latencyMs);
    e.providerCounts[r.provider] = (e.providerCounts[r.provider] ?? 0) + 1;
    if (r.humanAction != null) {
      e.decisions++;
      const accepted =
        r.humanAction === "accepted" || r.humanAction === "edited";
      if (accepted) e.accepts++;
      const isRecent = r.createdAt >= sevenDaysAgo;
      const isPrior =
        r.createdAt >= thirtyDaysAgo && r.createdAt < sevenDaysAgo;
      if (isRecent) {
        e.decisionsRecent++;
        if (accepted) e.acceptsRecent++;
      } else if (isPrior) {
        e.decisionsPrior++;
        if (accepted) e.acceptsPrior++;
      }
    }
    featureMap.set(r.feature, e);
  }
  const byFeature = Array.from(featureMap.entries())
    .map(([feature, e]) => {
      const sorted = [...e.latencies].sort((a, b) => a - b);
      const avgLatencyMs =
        sorted.length > 0
          ? Math.round(sorted.reduce((s, n) => s + n, 0) / sorted.length)
          : null;
      const acceptRecent =
        e.decisionsRecent > 0 ? e.acceptsRecent / e.decisionsRecent : null;
      const acceptPrior =
        e.decisionsPrior > 0 ? e.acceptsPrior / e.decisionsPrior : null;
      // Drift alerte si on a ≥ 10 décisions de chaque côté — sinon le bruit
      // statistique domine. Delta en points de pourcentage.
      let driftDeltaPct: number | null = null;
      if (
        e.decisionsRecent >= 10 &&
        e.decisionsPrior >= 10 &&
        acceptRecent != null &&
        acceptPrior != null
      ) {
        driftDeltaPct = Math.round((acceptRecent - acceptPrior) * 100);
      }
      return {
        feature,
        count: e.count,
        costCents: e.costCents,
        avgLatencyMs,
        p50LatencyMs: percentile(sorted, 50),
        p95LatencyMs: percentile(sorted, 95),
        acceptanceRate: e.decisions > 0 ? e.accepts / e.decisions : null,
        decisions: e.decisions,
        driftDeltaPct,
        providerMix: e.providerCounts,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Drift alerts : features avec dégradation > 15pp OU amélioration > 15pp
  const drift = byFeature
    .filter((f) => f.driftDeltaPct != null && Math.abs(f.driftDeltaPct) >= 15)
    .map((f) => ({
      feature: f.feature,
      deltaPct: f.driftDeltaPct!,
      direction: f.driftDeltaPct! < 0 ? "declining" : "improving",
    }))
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  // ---- Par provider (count + coût) --------------------------------------
  const byProvider: Record<string, { count: number; costCents: number }> = {};
  for (const r of rows) {
    const p = byProvider[r.provider] ?? { count: 0, costCents: 0 };
    p.count++;
    p.costCents += r.costCents ?? 0;
    byProvider[r.provider] = p;
  }

  // ---- Conformité scrub : quel % des appels sensibles ont été scrubbés ? -
  // Les calls à sensitivity `client_data` ou `regulated` DOIVENT être scrubbés
  // (sauf opt-out explicite via policy). On mesure la conformité réelle.
  const sensitiveRows = rows.filter(
    (r) =>
      r.sensitivityLevel === "client_data" ||
      r.sensitivityLevel === "regulated",
  );
  const scrubComplianceRate =
    sensitiveRows.length > 0
      ? sensitiveRows.filter((r) => r.scrubApplied).length / sensitiveRows.length
      : null;

  // ---- Par status --------------------------------------------------------
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  // ---- Par jour (sparkline) ----------------------------------------------
  const dayMap = new Map<string, { count: number; costCents: number }>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    const e = dayMap.get(key) ?? { count: 0, costCents: 0 };
    e.count++;
    e.costCents += r.costCents ?? 0;
    dayMap.set(key, e);
  }
  const byDay = Array.from(dayMap.entries())
    .map(([day, e]) => ({ day, count: e.count, costCents: e.costCents }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // ---- Faits en attente (toutes orgs) — nudge admin pour la revue -------
  const pendingFactsCount = await prisma.aiMemory.count({
    where: {
      verifiedAt: null,
      rejectedAt: null,
      scope: { startsWith: "org:" },
      NOT: { source: { startsWith: "manual:" } },
    },
  });

  // ---- Versions de prompt par feature — détection régression post-refactor
  // Pour chaque feature, agrège les stats clés PAR promptVersion. Permet de
  // comparer v1 vs v2 d'un prompt : acceptation, coût, échec, latence.
  const versionMap = new Map<
    string, // feature|version
    {
      feature: string;
      version: string;
      count: number;
      accepts: number;
      decisions: number;
      costCents: number;
      failures: number;
    }
  >();
  for (const r of rows) {
    if (!r.promptVersion) continue;
    const key = `${r.feature}|${r.promptVersion}`;
    const e = versionMap.get(key) ?? {
      feature: r.feature,
      version: r.promptVersion,
      count: 0,
      accepts: 0,
      decisions: 0,
      costCents: 0,
      failures: 0,
    };
    e.count++;
    e.costCents += r.costCents ?? 0;
    if (r.humanAction) {
      e.decisions++;
      if (r.humanAction === "accepted" || r.humanAction === "edited") {
        e.accepts++;
      }
    }
    if (r.status !== "ok" && r.status !== "blocked") e.failures++;
    versionMap.set(key, e);
  }
  const byVersion = Array.from(versionMap.values())
    .map((e) => ({
      ...e,
      acceptanceRate: e.decisions > 0 ? e.accepts / e.decisions : null,
      failureRate: e.count > 0 ? e.failures / e.count : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ---- Feedback explicite (désaccords catégorie + clics tickets similaires)
  // Signaux complémentaires à humanAction : les désaccords catégorie et les
  // clics sur tickets similaires sont tracés hors invocation.
  const [categoryDisagreements, similarClicks] = await Promise.all([
    prisma.aiCategoryFeedback
      .count({ where: { createdAt: { gte: since } } })
      .catch(() => 0),
    prisma.similarTicketClick
      .count({ where: { createdAt: { gte: since } } })
      .catch(() => 0),
  ]);

  // ---- Récents (20 dernières) --------------------------------------------
  const recent = await prisma.aiInvocation.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      feature: true,
      provider: true,
      modelName: true,
      costCents: true,
      latencyMs: true,
      status: true,
      humanAction: true,
      sensitivityLevel: true,
      scrubApplied: true,
      blockedReason: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    periodDays: days,
    totals: {
      invocations: totalCount,
      costCents: totalCostCents,
      failedRate: totalCount > 0 ? failedCount / totalCount : 0,
      acceptanceRate,
      acceptedCount,
      editedCount,
      rejectedCount: rows.filter((r) => r.humanAction === "rejected").length,
      decisionsTaken,
      scrubComplianceRate,
      sensitiveCalls: sensitiveRows.length,
    },
    byFeature,
    byProvider,
    byStatus,
    byDay,
    byVersion,
    drift,
    feedback: {
      categoryDisagreements,
      similarClicks,
    },
    pendingFactsCount,
    recent,
  });
}
