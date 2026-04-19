// ============================================================================
// Router de providers — sélectionne le meilleur provider pour une tâche
// selon la policy, la disponibilité et la préférence opérationnelle.
//
// Stratégie (self-hosted first) :
//   1. Filtrer les providers listés dans policy.allowedProviders
//   2. Tester availability (cache 30s pour Ollama, instantané pour OpenAI)
//   3. Préférer Ollama/local en PREMIER quand le GPU local est dispo
//      (coût zéro + données restent on-prem — souhait explicite du MSP).
//   4. Fallback OpenAI seulement si Ollama indisponible OU policy interdit
//      explicitement (ex: feature qui exige des capacités absentes du
//      modèle local — aujourd'hui aucune).
//   5. Si rien dispo → erreur bloquante.
//
// Override : AI_PREFER_CLOUD=1 inverse la préférence pour tests A/B.
// ============================================================================

import type {
  AiProvider,
  AiTask,
  AiPolicy,
  ProviderKind,
} from "./types";
import { OpenAiProvider } from "./providers/openai";
import { OllamaProvider } from "./providers/ollama";
import { AnthropicProvider } from "./providers/anthropic";

// Instances singleton — évite de recréer à chaque appel (surtout pour le
// cache d'availability d'Ollama).
const providers: Record<ProviderKind, AiProvider> = {
  openai: new OpenAiProvider(),
  anthropic: new AnthropicProvider(),
  ollama: new OllamaProvider(),
  // Réservé pour une future intégration (ex: llama.cpp direct, ou un
  // modèle embarqué dans le processus Node).
  local: new OllamaProvider(),
};

export function getProvider(kind: ProviderKind): AiProvider {
  return providers[kind];
}

/**
 * Choisit le meilleur provider disponible pour une tâche donnée. Renvoie
 * null si aucun provider autorisé n'est disponible — le caller affiche
 * alors un blocage explicite dans AiResult.error.
 *
 * `exclude` permet au retry après parse_failure de sauter le provider qui
 * a produit la réponse invalide et tenter le suivant dans l'ordre de
 * préférence.
 */
export async function selectProvider(
  task: AiTask,
  options?: { exclude?: Set<ProviderKind> },
): Promise<{
  provider: AiProvider;
  model: string;
} | null> {
  const { policy } = task;
  const exclude = options?.exclude ?? new Set<ProviderKind>();

  // Self-hosted first : on ordonne toujours Ollama/local avant le cloud, sauf
  // si AI_PREFER_CLOUD=1 (override explicite pour tests A/B ou si le modèle
  // local s'avère insuffisant sur une feature).
  // Override par-feature : policy.preferAnthropic ou policy.preferOpenAI.
  // BUDGET THROTTLE : si cette feature a dépassé son budget 24h, on IGNORE
  // la préférence cloud et on force Ollama (si autorisé). Permet au système
  // de se rétrograder tout seul en cas de coût anormal.
  let preferAnthropic =
    policy.preferAnthropic === true ||
    (process.env.AI_PREFER_CLOUD === "1" &&
      process.env.AI_PREFER_CLOUD_PROVIDER === "anthropic");
  let preferOpenAI =
    policy.preferOpenAI === true && !preferAnthropic ||
    (process.env.AI_PREFER_CLOUD === "1" &&
      process.env.AI_PREFER_CLOUD_PROVIDER !== "anthropic" &&
      !preferAnthropic);
  try {
    const { isFeatureThrottled } = await import(
      "@/lib/ai/jobs/budget-tracker"
    );
    if ((preferAnthropic || preferOpenAI) && (await isFeatureThrottled(policy.feature))) {
      console.warn(
        `[ai-router] feature '${policy.feature}' throttled budget — forçage Ollama local`,
      );
      preferAnthropic = false;
      preferOpenAI = false;
    }
  } catch {
    /* fail-open : si le throttle check échoue, on laisse passer */
  }
  // Ordre de préférence des providers cloud quand aucun override explicite :
  // Anthropic avant OpenAI (meilleur ratio qualité/coût + prompt caching
  // natif qui économise ~90% sur les system prompts stables).
  const preference: ProviderKind[] = preferAnthropic
    ? ["anthropic", "openai", "ollama", "local"]
    : preferOpenAI
    ? ["openai", "anthropic", "ollama", "local"]
    : ["ollama", "local", "anthropic", "openai"];

  const allowed = new Set(policy.allowedProviders);
  const ordered: ProviderKind[] = preference.filter(
    (k) => allowed.has(k) && !exclude.has(k),
  );

  for (const kind of ordered) {
    const provider = providers[kind];
    if (!provider) continue;
    const available = await provider.isAvailable();
    if (!available) continue;
    let model = resolveModel(kind, policy, task.forceModel, task.taskKind);
    // Safety fallback pour Ollama : si le modèle résolu (ex: SMALL) n'est
    // pas pull dans l'instance Ollama, on retombe sur le modèle principal.
    // Évite un 404 "model not found" sur les classifications quand l'admin
    // a config `OLLAMA_MODEL_SMALL=gemma3:4b` sans avoir exécuté `ollama
    // pull gemma3:4b`.
    if ((kind === "ollama" || kind === "local") && typeof (provider as { listModels?: () => Promise<Set<string>> }).listModels === "function") {
      const installed = await (provider as unknown as { listModels: () => Promise<Set<string>> }).listModels();
      if (installed.size > 0 && !installed.has(model)) {
        const fallback = process.env.OLLAMA_MODEL || "llama3.1:8b";
        if (installed.has(fallback)) {
          console.warn(
            `[ai-router] modèle '${model}' non installé, fallback vers '${fallback}' (pour l'installer : ollama pull ${model})`,
          );
          model = fallback;
        }
      }
    }
    return { provider, model };
  }

  return null;
}

/**
 * Résout le nom du modèle à passer au provider.
 *
 * Pour Ollama, on route selon le `taskKind` : les tâches "légères"
 * (classification, extraction simple) utilisent un modèle plus petit et
 * plus rapide si configuré (OLLAMA_MODEL_SMALL, ex: "gemma3:4b"). Les
 * tâches "lourdes" (chat, generation) prennent le modèle complet
 * (OLLAMA_MODEL, ex: "gemma3:12b").
 *
 * Gain observé : ~3× de vitesse sur les classifications avec gemma3:4b
 * vs gemma3:12b, tout en gardant une qualité correcte sur des tâches
 * simples (detect forwarded email, category suggest, priority suggest).
 *
 * Override : forceModel sur la task (très rare, A/B tests uniquement).
 */
function resolveModel(
  kind: ProviderKind,
  _policy: AiPolicy,
  forceModel?: string,
  taskKind?: string,
): string {
  if (forceModel) return forceModel;
  if (kind === "openai") {
    // Policy openai : petit modèle pour classifications, plein modèle sinon.
    const lightOpenai = process.env.OPENAI_MODEL_SMALL || "gpt-4o-mini";
    const fullOpenai = process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    return isLightTask(taskKind) ? lightOpenai : fullOpenai;
  }
  if (kind === "anthropic") {
    // Haiku pour les tâches légères (classification, extraction), Sonnet
    // pour le reste. Opus réservé aux cas très spécifiques via forceModel.
    const lightAnthropic =
      process.env.ANTHROPIC_MODEL_SMALL || "claude-haiku-4-5-20251001";
    const fullAnthropic = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
    return isLightTask(taskKind) ? lightAnthropic : fullAnthropic;
  }
  if (kind === "ollama" || kind === "local") {
    const light = process.env.OLLAMA_MODEL_SMALL;
    const full = process.env.OLLAMA_MODEL || "llama3.1:8b";
    return isLightTask(taskKind) && light ? light : full;
  }
  return "unknown";
}

function isLightTask(taskKind?: string): boolean {
  // Les tâches "légères" — classification, extraction — bénéficient du
  // petit modèle (gemma3:4b / gpt-4o-mini) qui est 2-3× plus rapide ET
  // ~équivalent en précision pour ces cas. Les tâches de génération
  // complexe (chat, resolution_notes, monthly_report) continuent sur
  // le plein modèle.
  return (
    taskKind === "classification" ||
    taskKind === "extraction" ||
    taskKind === "embedding"
  );
}
