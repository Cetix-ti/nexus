// ============================================================================
// DIGITAL TWIN — replay les tickets résolus avec catégorie humaine validée
// à travers la stack IA actuelle et compare la prédiction à la vérité terrain.
//
// Objectif : mesurer la précision EN CONDITIONS RÉELLES du modèle actuel,
// après tous les apprentissages automatiques (sanity stops, guidance, etc.).
// Signal fiable pour savoir si les feedback loops AMÉLIORENT ou DÉGRADENT.
//
// Différence avec meta-learning :
//   - meta-learning mesure l'accord juge IA (gpt-4o-mini) vs modèle local
//     sur des invocations DÉJÀ ARRIVÉES — feedback rétrospectif.
//   - digital-twin mesure la prédiction vs VÉRITÉ HUMAINE (catégorie
//     finale du ticket éditée par un tech) — feedback prospectif.
//
// Contrainte de coût : sample 15 tickets/run, OpenAI preferée (triage
// policy), coût ~ 15 × 0.1¢ = 1.5¢ par run. Weekly → négligeable.
//
// Stocke les métriques dans AiPattern(scope="meta:digital_twin", kind="run")
// avec un timestamp — permet de tracer la courbe d'accuracy dans le temps
// (affichable dans le dashboard admin IA).
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_TRIAGE } from "@/lib/ai/orchestrator/policies";

const SAMPLE_SIZE = 15;
const LOOKBACK_DAYS = 60;

interface TwinRunResult {
  runAt: string;
  sampled: number;
  matched: number;        // prédiction == catégorie humaine
  parentMatched: number;  // prédiction == catégorie parente (proche)
  wrong: number;          // prédiction complètement hors-sujet
  skipped: number;        // pas de réponse IA
  accuracy: number;       // matched / sampled
  looseAccuracy: number;  // (matched + parentMatched) / sampled
  byCategory: Record<string, { total: number; matched: number }>;
  deltaVsPrevious: number | null;
}

export async function runDigitalTwin(): Promise<TwinRunResult | null> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  // Cible : tickets avec catégorie FINALE assignée par un humain (pas par
  // l'IA). Si categorySource="MANUAL" → vérité terrain. Si categorySource
  // est null (legacy) on accepte aussi car c'était forcément manuel.
  const candidates = await prisma.ticket.findMany({
    where: {
      status: { in: ["RESOLVED", "CLOSED"] },
      categoryId: { not: null },
      source: { notIn: ["MONITORING", "AUTOMATION"] },
      createdAt: { gte: since },
      OR: [
        { categorySource: "MANUAL" },
        { categorySource: null },
      ],
      subject: { not: "" },
    },
    select: {
      id: true,
      subject: true,
      description: true,
      categoryId: true,
      organizationId: true,
    },
    take: SAMPLE_SIZE * 6, // on sur-échantillonne pour tirer aléatoirement
    orderBy: { createdAt: "desc" },
  });
  if (candidates.length < 5) return null;

  // Tirage aléatoire sans remise.
  const sample = shuffleInPlace(candidates).slice(0, SAMPLE_SIZE);

  // Charge les chemins de catégorie pour pouvoir tester le "parent match".
  const allCats = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const byId = new Map(allCats.map((c) => [c.id, c]));
  const ancestorsOf = (catId: string): Set<string> => {
    const set = new Set<string>();
    let cur = byId.get(catId);
    while (cur) {
      set.add(cur.id);
      if (!cur.parentId) break;
      cur = byId.get(cur.parentId);
    }
    return set;
  };

  const result: TwinRunResult = {
    runAt: new Date().toISOString(),
    sampled: sample.length,
    matched: 0,
    parentMatched: 0,
    wrong: 0,
    skipped: 0,
    accuracy: 0,
    looseAccuracy: 0,
    byCategory: {},
    deltaVsPrevious: null,
  };

  for (const t of sample) {
    try {
      const predicted = await predictCategory(t.subject, t.description ?? "");
      if (!predicted) {
        result.skipped++;
        continue;
      }
      const actualAncestors = ancestorsOf(t.categoryId as string);
      const predictedAncestors = ancestorsOf(predicted);
      const exact = predicted === t.categoryId;
      const parent =
        !exact &&
        (actualAncestors.has(predicted) || predictedAncestors.has(t.categoryId as string));

      if (exact) result.matched++;
      else if (parent) result.parentMatched++;
      else result.wrong++;

      const catName =
        byId.get(t.categoryId as string)?.name ?? "(inconnu)";
      const bucket =
        result.byCategory[catName] ?? { total: 0, matched: 0 };
      bucket.total++;
      if (exact) bucket.matched++;
      result.byCategory[catName] = bucket;
    } catch (err) {
      console.warn(`[digital-twin] ticket ${t.id} failed:`, err);
      result.skipped++;
    }
  }

  const evaluated = result.sampled - result.skipped;
  if (evaluated > 0) {
    result.accuracy = Math.round((result.matched / evaluated) * 1000) / 1000;
    result.looseAccuracy =
      Math.round(
        ((result.matched + result.parentMatched) / evaluated) * 1000,
      ) / 1000;
  }

  // Compare au run précédent pour tracer la tendance.
  const previous = await prisma.aiPattern.findFirst({
    where: { scope: "meta:digital_twin", kind: "run" },
    orderBy: { createdAt: "desc" },
    select: { value: true },
  });
  if (previous) {
    const prev = previous.value as Partial<TwinRunResult> | null;
    if (prev && typeof prev.accuracy === "number") {
      result.deltaVsPrevious =
        Math.round((result.accuracy - prev.accuracy) * 1000) / 1000;
    }
  }

  // Stocke le run avec une clé datée pour historique.
  const key = `run_${result.runAt.slice(0, 10)}`;
  try {
    await prisma.aiPattern.upsert({
      where: {
        scope_kind_key: {
          scope: "meta:digital_twin",
          kind: "run",
          key,
        },
      },
      create: {
        scope: "meta:digital_twin",
        kind: "run",
        key,
        value: result as never,
        sampleCount: result.sampled,
        confidence: Math.min(1, result.sampled / 20),
      },
      update: {
        value: result as never,
        sampleCount: result.sampled,
        confidence: Math.min(1, result.sampled / 20),
      },
    });
    console.log(
      `[digital-twin] ${result.sampled} tickets : ${result.matched} exact, ${result.parentMatched} parent, ${result.wrong} wrong → accuracy ${(result.accuracy * 100).toFixed(1)}%${result.deltaVsPrevious !== null ? ` (Δ ${result.deltaVsPrevious >= 0 ? "+" : ""}${(result.deltaVsPrevious * 100).toFixed(1)}pt)` : ""}`,
    );
  } catch (err) {
    console.warn("[digital-twin] upsert failed:", err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Prédiction LLM — variante allégée de buildTriagePrompt, sans les signaux
// "duplicate" ni "major incident" qui ne servent pas au benchmark.
// ---------------------------------------------------------------------------

async function predictCategory(
  subject: string,
  description: string,
): Promise<string | null> {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true },
    orderBy: { name: "asc" },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const pathOf = (c: { id: string; name: string; parentId: string | null }): string => {
    const chain: string[] = [c.name];
    let parentId = c.parentId;
    while (parentId) {
      const p = byId.get(parentId);
      if (!p) break;
      chain.unshift(p.name);
      parentId = p.parentId;
    }
    return chain.join(" > ");
  };
  const catLines = categories
    .slice(0, 250)
    .map((c) => `- [${c.id}] ${pathOf(c)}`)
    .join("\n");

  const system = `Tu es un triage officer MSP. Classe le billet ci-dessous dans UNE catégorie exacte parmi celles listées.
Réponds en JSON strict : { "categoryId": "<id>" | null, "confidence": 0.0-1.0 }.
Si aucune catégorie ne correspond littéralement → categoryId=null.`;
  const user = `Sujet : ${subject}
Description : ${description.slice(0, 2000)}

Catégories disponibles :
${catLines}`;

  const result = await runAiTask({
    policy: POLICY_TRIAGE,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: "classification",
  });
  if (!result.ok || !result.content) return null;
  try {
    const parsed = JSON.parse(result.content) as {
      categoryId?: string | null;
    };
    if (typeof parsed.categoryId === "string" && byId.has(parsed.categoryId)) {
      return parsed.categoryId;
    }
  } catch {
    return null;
  }
  return null;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
