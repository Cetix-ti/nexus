// ============================================================================
// META-LEARNING — mesure si les patterns appris automatiquement AMÉLIORENT
// vraiment les verdicts d'audit. Les patterns inefficaces sont retirés.
//
// Problème : les systèmes d'auto-apprentissage (ai-audit, prompt-evolution,
// learning-loops, etc.) accumulent des patterns SANS jamais se remettre en
// question. Un mot ajouté à SANITY_STOP peut CASSER un cas que la version
// précédente traitait bien. Sans évaluation, le modèle dérive.
//
// Mécanisme :
//   1. Pour chaque pattern appris depuis ≥ MIN_AGE_DAYS jours, on calcule :
//      - agreement_before = agreement rate audit des 14 jours AVANT son ajout
//      - agreement_after  = agreement rate audit des 14 jours APRÈS
//      - delta = after - before
//   2. Si delta ≤ HARMFUL_THRESHOLD → marque comme "harmful" (confidence=0 +
//      status dans value), sera ignoré par les consumers.
//   3. Si delta ∈ [-0.02, +0.02] → "neutral" (garde actif mais flagué).
//   4. Si delta > +0.02 → "beneficial" (confidence boostée).
//
// Les consumers (getLearnedPatterns, getPromptGuidance) DEVRAIENT lire
// value.metaStatus et skipper ceux marqués "harmful". On ajoute ce filtre
// dans les helpers existants en mode opportuniste (voir §APPLICATION).
//
// Stocke aussi un "health score" global par feature :
// AiPattern(scope="meta:feature_health", kind="score", key=<feature>)
// lu par le dashboard admin d'intelligence IA.
// ============================================================================

import prisma from "@/lib/prisma";

const MIN_AGE_DAYS = 7;
const EVAL_WINDOW_DAYS = 14;
const HARMFUL_DELTA = -0.03;
const BENEFICIAL_DELTA = 0.03;
const LEARNED_SCOPES_PREFIX = ["learned:", "prompt:"];

interface PatternEvaluation {
  agreementBefore: number | null;
  agreementAfter: number | null;
  delta: number | null;
  sampleBefore: number;
  sampleAfter: number;
  status: "beneficial" | "neutral" | "harmful" | "insufficient_data";
  evaluatedAt: string;
}

export async function runMetaLearning(): Promise<{
  patternsEvaluated: number;
  beneficial: number;
  neutral: number;
  harmful: number;
  insufficient: number;
  featureHealthWritten: number;
}> {
  const stats = {
    patternsEvaluated: 0,
    beneficial: 0,
    neutral: 0,
    harmful: 0,
    insufficient: 0,
    featureHealthWritten: 0,
  };

  // 1. Charge tous les patterns appris candidats à l'évaluation.
  const cutoff = new Date(Date.now() - MIN_AGE_DAYS * 24 * 3600_000);
  const patterns = await prisma.aiPattern.findMany({
    where: {
      OR: LEARNED_SCOPES_PREFIX.map((p) => ({
        scope: { startsWith: p },
      })),
      createdAt: { lte: cutoff },
    },
    select: {
      id: true,
      scope: true,
      kind: true,
      key: true,
      value: true,
      sampleCount: true,
      createdAt: true,
    },
  });

  for (const p of patterns) {
    const feature = p.scope.split(":")[1] ?? "unknown";
    const addedAt = p.createdAt;

    const windowMs = EVAL_WINDOW_DAYS * 24 * 3600_000;
    const beforeStart = new Date(addedAt.getTime() - windowMs);
    const afterEnd = new Date(addedAt.getTime() + windowMs);
    const nowMs = Date.now();
    // Si la fenêtre "après" n'a pas encore assez de recul, on skip.
    if (afterEnd.getTime() > nowMs) {
      stats.insufficient++;
      continue;
    }

    const [beforeAudits, afterAudits] = await Promise.all([
      prisma.aiAuditResult.findMany({
        where: {
          feature,
          createdAt: { gte: beforeStart, lt: addedAt },
        },
        select: { verdict: true },
      }),
      prisma.aiAuditResult.findMany({
        where: {
          feature,
          createdAt: { gte: addedAt, lt: afterEnd },
        },
        select: { verdict: true },
      }),
    ]);

    const MIN_SAMPLES = 8;
    const evaluation: PatternEvaluation = {
      agreementBefore: null,
      agreementAfter: null,
      delta: null,
      sampleBefore: beforeAudits.length,
      sampleAfter: afterAudits.length,
      status: "insufficient_data",
      evaluatedAt: new Date().toISOString(),
    };

    if (
      beforeAudits.length >= MIN_SAMPLES &&
      afterAudits.length >= MIN_SAMPLES
    ) {
      const before =
        beforeAudits.filter((a) => a.verdict === "agree").length /
        beforeAudits.length;
      const after =
        afterAudits.filter((a) => a.verdict === "agree").length /
        afterAudits.length;
      evaluation.agreementBefore = Math.round(before * 1000) / 1000;
      evaluation.agreementAfter = Math.round(after * 1000) / 1000;
      evaluation.delta = Math.round((after - before) * 1000) / 1000;
      if (evaluation.delta <= HARMFUL_DELTA) evaluation.status = "harmful";
      else if (evaluation.delta >= BENEFICIAL_DELTA)
        evaluation.status = "beneficial";
      else evaluation.status = "neutral";
    }

    // Écrit l'évaluation dans le value du pattern SANS perdre son contenu
    // original. Les consumers qui font peu de lectures peuvent lire
    // value.metaStatus pour filtrer.
    const existing = (p.value as Record<string, unknown>) ?? {};
    const newValue = {
      ...existing,
      metaStatus: evaluation.status,
      metaEvaluation: evaluation,
    };

    // Nouvelle confiance — harmful rétrograde, beneficial booste.
    let newConfidence: number | null = null;
    if (evaluation.status === "harmful") newConfidence = 0;
    else if (evaluation.status === "beneficial")
      newConfidence = Math.min(1, (p.sampleCount || 1) / 8);
    // neutral/insufficient → laisse tel quel

    try {
      await prisma.aiPattern.update({
        where: { id: p.id },
        data: {
          value: newValue as never,
          ...(newConfidence !== null ? { confidence: newConfidence } : {}),
        },
      });
      stats.patternsEvaluated++;
      if (evaluation.status === "beneficial") stats.beneficial++;
      else if (evaluation.status === "neutral") stats.neutral++;
      else if (evaluation.status === "harmful") stats.harmful++;
      else stats.insufficient++;
    } catch (err) {
      console.warn(`[meta-learning] update failed for pattern ${p.id}:`, err);
    }
  }

  // 2. Calcul des health scores globaux par feature.
  const featureHealthSince = new Date(
    Date.now() - 30 * 24 * 3600_000,
  );
  const features = await prisma.aiAuditResult.findMany({
    where: { createdAt: { gte: featureHealthSince } },
    select: { feature: true, verdict: true, createdAt: true },
  });
  const byFeature = new Map<
    string,
    { total: number; agreed: number; disagreed: number; partial: number }
  >();
  for (const f of features) {
    const row = byFeature.get(f.feature) ?? {
      total: 0,
      agreed: 0,
      disagreed: 0,
      partial: 0,
    };
    row.total++;
    if (f.verdict === "agree") row.agreed++;
    else if (f.verdict === "disagree") row.disagreed++;
    else if (f.verdict === "partial") row.partial++;
    byFeature.set(f.feature, row);
  }

  for (const [feature, counts] of byFeature) {
    if (counts.total < 8) continue;
    const agreementRate = counts.agreed / counts.total;
    const disagreementRate = counts.disagreed / counts.total;

    // Tendance 7j vs 30j — un score "trending" montre si la feature s'améliore.
    const since7 = new Date(Date.now() - 7 * 24 * 3600_000);
    const recent = features.filter(
      (f) => f.feature === feature && f.createdAt >= since7,
    );
    const recentRate =
      recent.length >= 4
        ? recent.filter((f) => f.verdict === "agree").length / recent.length
        : null;

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "meta:feature_health",
            kind: "score",
            key: feature,
          },
        },
        create: {
          scope: "meta:feature_health",
          kind: "score",
          key: feature,
          value: {
            agreementRate: Math.round(agreementRate * 1000) / 1000,
            disagreementRate: Math.round(disagreementRate * 1000) / 1000,
            recentRate7d:
              recentRate !== null ? Math.round(recentRate * 1000) / 1000 : null,
            trend:
              recentRate !== null
                ? Math.round((recentRate - agreementRate) * 1000) / 1000
                : null,
            totalAudits: counts.total,
            evaluatedAt: new Date().toISOString(),
          } as never,
          sampleCount: counts.total,
          confidence: Math.min(1, counts.total / 30),
        },
        update: {
          value: {
            agreementRate: Math.round(agreementRate * 1000) / 1000,
            disagreementRate: Math.round(disagreementRate * 1000) / 1000,
            recentRate7d:
              recentRate !== null ? Math.round(recentRate * 1000) / 1000 : null,
            trend:
              recentRate !== null
                ? Math.round((recentRate - agreementRate) * 1000) / 1000
                : null,
            totalAudits: counts.total,
            evaluatedAt: new Date().toISOString(),
          } as never,
          sampleCount: counts.total,
          confidence: Math.min(1, counts.total / 30),
        },
      });
      stats.featureHealthWritten++;
    } catch (err) {
      console.warn(
        `[meta-learning] upsert feature_health failed for ${feature}:`,
        err,
      );
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helper : un pattern est-il marqué "harmful" (à ignorer par les consumers) ?
// Appelé par getLearnedPatterns pour filtrer.
// ---------------------------------------------------------------------------

export function isPatternHarmful(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { metaStatus?: string };
  return v.metaStatus === "harmful";
}
