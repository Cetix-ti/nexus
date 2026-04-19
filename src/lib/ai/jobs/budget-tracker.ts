// ============================================================================
// BUDGET TRACKER — suit la consommation de tokens / coût par feature et
// peut FORCER un downgrade automatique (Ollama local au lieu d'OpenAI) si
// une feature dépasse son budget horaire.
//
// Objectif : empêcher une dérive silencieuse du coût IA. Si une feature
// devient tout à coup coûteuse (bug boucle, spam de classifications),
// le système la rétrograde sur Ollama gratuit jusqu'au prochain reset.
//
// Budgets par feature (cents/jour) — modifiables via env AI_BUDGET_<feature>.
// La liste par défaut est intentionnellement CONSERVATRICE : un MSP typique
// traite 200 tickets/jour → 200 triages × 2.5¢ = 50¢. Marge 3× pour les
// rapports + audits.
//
// Mécanisme :
//   1. Job toutes les heures : calcule total tokens + coût estimé des 24h
//      glissantes par feature. Écrit dans AiPattern(scope="budget:usage").
//   2. Si coût(feature) > budget(feature) → écrit un flag
//      AiPattern(scope="budget:throttle", kind="feature", key=<feature>) qui
//      persiste 24h.
//   3. Le router lit ce flag via isFeatureThrottled() avant de sélectionner
//      un provider — si throttled ET allowed inclut "ollama", force Ollama.
//   4. Les policies qui N'ACCEPTENT PAS Ollama (ex: POLICY_AI_AUDIT) sont
//      simplement bloquées en attendant le reset — pas de downgrade muet.
// ============================================================================

import prisma from "@/lib/prisma";

// Tarifs OpenAI en cents/1M tokens (au 2025-04). Ajuster si changement.
const OPENAI_PRICING_CENTS_PER_MTOK: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 15, out: 60 },
  "gpt-4o": { in: 500, out: 1500 },
  "gpt-5": { in: 1250, out: 10000 },
};

// Budgets par défaut par feature (cents/24h).
const DEFAULT_BUDGETS_CENTS: Record<string, number> = {
  triage: 500,                // 200 tickets/j × 2.5¢ ≈ 500¢ (= 5$)
  category_suggest: 100,
  priority_suggest: 50,
  response_assist: 300,
  resolution_notes: 200,
  risk_analysis: 300,
  monthly_report: 500,        // ponctuel mais cher
  kb_gen: 200,
  kb_audit: 500,
  ai_audit: 300,              // coûts du juge lui-même
  facts_extract: 200,
  copilot_chat: 400,
};

function getBudgetForFeature(feature: string): number {
  const envOverride = process.env[`AI_BUDGET_${feature.toUpperCase()}`];
  if (envOverride) {
    const n = Number(envOverride);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_BUDGETS_CENTS[feature] ?? 500;
}

interface FeatureUsage {
  feature: string;
  invocations: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  byProvider: Record<string, { invocations: number; costCents: number }>;
}

export async function runBudgetTracker(): Promise<{
  featuresTracked: number;
  featuresThrottled: number;
  featuresReset: number;
}> {
  const stats = { featuresTracked: 0, featuresThrottled: 0, featuresReset: 0 };
  const since = new Date(Date.now() - 24 * 3600_000);

  // 1. Aggrège les invocations des 24h.
  const invocations = await prisma.aiInvocation.findMany({
    where: { createdAt: { gte: since } },
    select: {
      feature: true,
      provider: true,
      modelName: true,
      promptTokens: true,
      responseTokens: true,
      costCents: true,
    },
  });

  const byFeature = new Map<string, FeatureUsage>();
  for (const inv of invocations) {
    const u = byFeature.get(inv.feature) ?? {
      feature: inv.feature,
      invocations: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostCents: 0,
      byProvider: {},
    };
    u.invocations++;
    const pIn = inv.promptTokens ?? 0;
    const pOut = inv.responseTokens ?? 0;
    u.inputTokens += pIn;
    u.outputTokens += pOut;
    const cost =
      typeof inv.costCents === "number"
        ? inv.costCents
        : estimateCostCents(inv.provider, inv.modelName, pIn, pOut);
    u.estimatedCostCents += cost;
    const p = u.byProvider[inv.provider] ?? { invocations: 0, costCents: 0 };
    p.invocations++;
    p.costCents += cost;
    u.byProvider[inv.provider] = p;
    byFeature.set(inv.feature, u);
  }

  // 2. Écrit le rollup + évalue le throttle.
  for (const [feature, usage] of byFeature) {
    stats.featuresTracked++;
    const budget = getBudgetForFeature(feature);
    const pctUsed = Math.round((usage.estimatedCostCents / budget) * 100);
    const dateKey = new Date().toISOString().slice(0, 10); // UTC day

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "budget:usage",
            kind: "daily",
            key: `${dateKey}|${feature}`,
          },
        },
        create: {
          scope: "budget:usage",
          kind: "daily",
          key: `${dateKey}|${feature}`,
          value: {
            ...usage,
            budgetCents: budget,
            pctUsed,
            updatedAt: new Date().toISOString(),
          } as never,
          sampleCount: usage.invocations,
          confidence: 1,
        },
        update: {
          value: {
            ...usage,
            budgetCents: budget,
            pctUsed,
            updatedAt: new Date().toISOString(),
          } as never,
          sampleCount: usage.invocations,
        },
      });
    } catch (err) {
      console.warn(
        `[budget-tracker] upsert usage failed for ${feature}:`,
        err,
      );
    }

    // Throttle si > 100% du budget — auto-expire après 24h.
    if (usage.estimatedCostCents > budget) {
      try {
        await prisma.aiPattern.upsert({
          where: {
            scope_kind_key: {
              scope: "budget:throttle",
              kind: "feature",
              key: feature,
            },
          },
          create: {
            scope: "budget:throttle",
            kind: "feature",
            key: feature,
            value: {
              feature,
              budgetCents: budget,
              usageCents: usage.estimatedCostCents,
              pctUsed,
              throttledAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
            } as never,
            sampleCount: 1,
            confidence: 1,
          },
          update: {
            value: {
              feature,
              budgetCents: budget,
              usageCents: usage.estimatedCostCents,
              pctUsed,
              throttledAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
            } as never,
          },
        });
        stats.featuresThrottled++;
        console.warn(
          `[budget-tracker] feature '${feature}' throttled : ${pctUsed}% du budget (${usage.estimatedCostCents}¢ / ${budget}¢)`,
        );
      } catch (err) {
        console.warn(
          `[budget-tracker] throttle upsert failed for ${feature}:`,
          err,
        );
      }
    }
  }

  // 3. Expiration des throttles anciens (> 24h).
  const throttles = await prisma.aiPattern.findMany({
    where: { scope: "budget:throttle", kind: "feature" },
    select: { id: true, value: true },
  });
  const toRemove: string[] = [];
  for (const t of throttles) {
    const v = t.value as { expiresAt?: string; feature?: string } | null;
    if (!v?.expiresAt) continue;
    if (new Date(v.expiresAt).getTime() <= Date.now()) {
      toRemove.push(t.id);
    }
  }
  if (toRemove.length > 0) {
    await prisma.aiPattern.deleteMany({ where: { id: { in: toRemove } } });
    stats.featuresReset += toRemove.length;
    console.log(
      `[budget-tracker] ${toRemove.length} throttle(s) expiré(s) — features réactivées`,
    );
  }

  return stats;
}

function estimateCostCents(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  if (provider !== "openai") return 0;
  const pricing =
    OPENAI_PRICING_CENTS_PER_MTOK[model] ??
    OPENAI_PRICING_CENTS_PER_MTOK["gpt-4o-mini"];
  const costIn = (tokensIn / 1_000_000) * pricing.in;
  const costOut = (tokensOut / 1_000_000) * pricing.out;
  // Arrondi au dixième de cent puis au cent plein — coût toujours positif.
  return Math.max(0, Math.ceil(costIn + costOut));
}

// ---------------------------------------------------------------------------
// Helper public — le router lit ça avant de sélectionner un provider.
// Cache in-memory 5 min pour ne pas lire AiPattern à chaque invocation.
// ---------------------------------------------------------------------------

let throttleCache: {
  at: number;
  set: Set<string>;
} = { at: 0, set: new Set() };
const THROTTLE_CACHE_TTL_MS = 5 * 60_000;

export async function getThrottledFeatures(): Promise<Set<string>> {
  if (Date.now() - throttleCache.at < THROTTLE_CACHE_TTL_MS) {
    return throttleCache.set;
  }
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "budget:throttle", kind: "feature" },
    select: { key: true, value: true },
  });
  const active = new Set<string>();
  for (const r of rows) {
    const v = r.value as { expiresAt?: string } | null;
    if (!v?.expiresAt) continue;
    if (new Date(v.expiresAt).getTime() > Date.now()) {
      active.add(r.key);
    }
  }
  throttleCache = { at: Date.now(), set: active };
  return active;
}

export async function isFeatureThrottled(feature: string): Promise<boolean> {
  const set = await getThrottledFeatures();
  return set.has(feature);
}
