// ============================================================================
// AiOrchestrator — point d'entrée UNIQUE pour toute invocation IA dans Nexus.
//
// Flux :
//   1. Valide la policy (feature déclarée, providers autorisés cohérents)
//   2. Applique le scrubber si policy.scrub.* → messages anonymisés
//   3. Sélectionne le provider (router.ts) selon policy + disponibilité
//   4. Exécute l'appel chat() du provider avec timeout + budget
//   5. Dé-anonymise la réponse si scrub appliqué
//   6. Log AiInvocation en DB (audit + calibration)
//   7. Retourne AiResult (ok + invocationId pour tracking humanAction)
//
// Aucune autre couche de Nexus ne doit appeler fetch() vers OpenAI/Ollama
// directement. Toutes les features passent par run().
// ============================================================================

import crypto from "node:crypto";
import prisma from "@/lib/prisma";
import {
  createAnonymizer,
  seedFromDatabase,
  anonymizeText,
  deanonymize,
} from "@/lib/ai/anonymizer";
import { selectProvider } from "./router";
import { getCached, setCached } from "./cache";
import type {
  AiTask,
  AiResult,
  AiPolicy,
  AiMessage,
  AiTaskContext,
} from "./types";

export type * from "./types";
export * as policies from "./policies";
export { tryParseJson } from "./json-repair";

/**
 * Exécute une tâche IA selon sa policy. Jamais throw — retourne toujours
 * un AiResult avec ok=false + error en cas d'échec. Le caller décide quoi
 * faire (fallback, message UI, re-try).
 */
export async function runAiTask(task: AiTask): Promise<AiResult> {
  const t0 = Date.now();

  // -- 1. Validation policy --------------------------------------------------
  if (!task.policy || !task.policy.feature) {
    return failSync("policy.feature manquant", t0);
  }
  if (task.policy.allowedProviders.length === 0) {
    return failSync(
      `policy '${task.policy.feature}' n'autorise aucun provider`,
      t0,
    );
  }

  // -- 1b. Enforcement du consent Loi 25 (par organisation) ----------------
  // Si le task est scopé à une org (context.organizationId), on vérifie le
  // consent avant tout appel. Trois cas :
  //   - aiEnabled=false         → block absolu (aucun appel IA sur cette org)
  //   - clientContentEnabled=false + feature client-facing → block
  //   - learningEnabled=false + feature d'apprentissage → block
  //   - cloudProvidersAllowed=false → on restreint task.policy.allowedProviders
  //     à exclure anthropic/openai — le router prendra Ollama uniquement.
  if (task.context?.organizationId) {
    const { getAiConsent, isClientFacingFeature, isLearningFeature } =
      await import("@/lib/ai/consent");
    const consent = await getAiConsent(task.context.organizationId);
    if (!consent.aiEnabled) {
      return failSync(
        `IA désactivée pour cette organisation (consent révoqué)`,
        t0,
      );
    }
    if (
      !consent.clientContentEnabled &&
      isClientFacingFeature(task.policy.feature)
    ) {
      return failSync(
        `Feature '${task.policy.feature}' désactivée pour cette organisation (contenu client-facing)`,
        t0,
      );
    }
    if (
      !consent.learningEnabled &&
      isLearningFeature(task.policy.feature)
    ) {
      return failSync(
        `Feature '${task.policy.feature}' désactivée pour cette organisation (apprentissage)`,
        t0,
      );
    }
    if (!consent.cloudProvidersAllowed) {
      // Restreint aux providers locaux. Si la policy n'autorisait QUE cloud,
      // l'appel sera bloqué par le router (aucun provider dispo).
      const restricted = task.policy.allowedProviders.filter(
        (p) => p === "ollama" || p === "local",
      );
      task = {
        ...task,
        policy: { ...task.policy, allowedProviders: restricted },
      };
    }
  }

  // Installe un validateur JSON par défaut quand la policy demande json_object
  // et que le caller n'en a pas fourni. Protège toutes les features structurées
  // contre les réponses invalides sans changer leur code — le retry
  // cross-provider s'active automatiquement si Ollama (par exemple) produit
  // un JSON mal formé là où Anthropic parserait proprement.
  if (
    task.policy.responseFormat === "json_object" &&
    !task.responseValidator
  ) {
    task = {
      ...task,
      responseValidator: (content: string) => {
        if (!content || content.trim().length === 0) return false;
        // Tente parsing direct puis extraction de bloc {...} (cascade simple).
        try {
          JSON.parse(content);
          return true;
        } catch {
          const m = content.match(/\{[\s\S]*\}/);
          if (!m) return false;
          try {
            JSON.parse(m[0]);
            return true;
          } catch {
            return false;
          }
        }
      },
    };
  }

  // -- 1b. Short-circuit : input trop court pour donner un résultat utile --
  // Évite de consommer du compute/tokens sur des tickets vides ou des
  // inputs pauvres. La limite est déclarée par la policy (minInputChars).
  if (task.policy.minInputChars && task.policy.minInputChars > 0) {
    const userLen = task.messages
      .filter((m) => m.role === "user")
      .reduce((acc, m) => acc + (m.content?.length ?? 0), 0);
    if (userLen < task.policy.minInputChars) {
      return await logAndReturn(
        {
          ok: false,
          latencyMs: Date.now() - t0,
          error: {
            kind: "blocked",
            reason: `Input trop court (${userLen} < ${task.policy.minInputChars} chars requis)`,
          },
        },
        task,
        {
          provider: "short-circuit",
          modelName: "none",
          scrubApplied: false,
          status: "blocked",
        },
      );
    }
  }

  // -- 2. Préparation scrub (lazy, partagée entre tentatives) --------------
  // Le seed DB est coûteux (4 requêtes parallèles). On le fait UNE SEULE fois
  // et on partage la map entre les tentatives du retry loop. Par contre, la
  // DÉCISION de scrubber ou non dépend du provider retenu : un feature qui
  // tolère `clientNames: false` sur Ollama local peut être forcé à scrubber
  // strict via `cloudScrubOverride` quand le retry tombe sur Anthropic/OpenAI.
  const cacheTtlMs = (task.policy.cacheTtlSeconds ?? 0) * 1000;
  let scrubMap: ReturnType<typeof createAnonymizer> | null = null;
  let scrubSeedFailed = false;
  async function ensureScrubMap(): Promise<ReturnType<typeof createAnonymizer>> {
    if (scrubMap) return scrubMap;
    const m = createAnonymizer();
    try {
      await seedFromDatabase(m);
    } catch (err) {
      // Seed échec ≠ blocage : on scrubbe au fil de l'eau (moins fiable
      // mais permet de ne pas perdre la feature en cas d'hiccup DB).
      console.warn("[ai-orchestrator] anonymizer seed failed:", err);
      scrubSeedFailed = true;
    }
    scrubMap = m;
    return m;
  }

  // Détermine le scrub effectif pour un provider donné.
  function effectiveScrubFor(
    kind: import("./types").ProviderKind,
  ): {
    scrub: import("./types").ScrubConfig;
    requested: boolean;
  } {
    const isCloud = kind === "openai" || kind === "anthropic";
    const cfg =
      isCloud && task.policy.cloudScrubOverride
        ? task.policy.cloudScrubOverride
        : task.policy.scrub;
    return {
      scrub: cfg,
      requested: cfg.pii || cfg.hostnames || cfg.clientNames,
    };
  }

  // -- 3+4. Sélection provider + appel, avec retry cross-provider sur
  // parse_failure uniquement. Max 2 tentatives (provider initial + 1 retry).
  //
  // Pourquoi : Ollama ne garantit pas `format: "json"` strict, et Anthropic
  // n'a pas de mode JSON natif. Quand une feature déclare `responseValidator`
  // (typiquement JSON.parse), on peut recevoir une réponse syntaxiquement
  // invalide d'un provider mais qu'un autre provider parserait correctement.
  // Le retry passe sur le provider suivant dans l'ordre de préférence. Les
  // échecs provider_error / timeout ne sont PAS retriés (déjà gérés par le
  // fallback naturel du router).
  const excludedProviders = new Set<import("./types").ProviderKind>();
  let providerResponse: import("./types").ProviderResponse | undefined;
  let lastProvider: { kind: string; estimateCostCents: (p: number, r: number, m: string) => number } | undefined;
  let lastModel = "unknown";
  let parseFailureCount = 0;

  // Variables partagées capturant la tentative finale réussie (ou dernière
  // échouée) pour le logging post-loop.
  let finalScrubRequested = false;
  let finalPromptHash = "";
  let finalMessages: AiMessage[] = task.messages;

  for (let attempt = 0; attempt < 2; attempt++) {
    const selection = await selectProvider(task, {
      exclude: excludedProviders,
    });
    if (!selection) {
      if (parseFailureCount > 0) {
        // On a eu au moins un parse_failure mais plus de provider dispo →
        // échec final. Log l'invocation en parse_failure.
        return await logAndReturn(
          {
            ok: false,
            latencyMs: Date.now() - t0,
            error: {
              kind: "parse_failure",
              reason: `Réponse invalide après ${parseFailureCount} tentative(s) — aucun provider restant`,
            },
          },
          task,
          {
            provider: lastProvider?.kind ?? task.policy.allowedProviders[0],
            modelName: lastModel,
            scrubApplied: finalScrubRequested,
            status: "parse_failure",
          },
        );
      }
      // Aucun provider dispo dès le premier essai → blocked.
      return await logAndReturn(
        {
          ok: false,
          latencyMs: Date.now() - t0,
          error: {
            kind: "blocked",
            reason: `Aucun provider disponible parmi [${task.policy.allowedProviders.join(", ")}]`,
          },
        },
        task,
        {
          provider: task.policy.allowedProviders[0],
          modelName: "unknown",
          scrubApplied: false,
          status: "blocked",
        },
      );
    }
    const { provider, model } = selection;
    lastProvider = provider;
    lastModel = model;

    // -- Scrub spécifique à ce provider (cloud override possible) --------
    const { scrub: activeScrub, requested: scrubRequested } =
      effectiveScrubFor(provider.kind);
    finalScrubRequested = scrubRequested;
    let messages: AiMessage[];
    if (scrubRequested) {
      const map = await ensureScrubMap();
      messages = task.messages.map((m) => ({
        role: m.role,
        content: anonymizeText(map, m.content),
      }));
      if (scrubSeedFailed) {
        console.warn(
          `[ai-orchestrator] feature '${task.policy.feature}' scrubbed sans seed DB (dégradé)`,
        );
      }
    } else {
      messages = task.messages;
    }
    finalMessages = messages;
    // Le champ activeScrub n'est plus consulté directement — seul le flag
    // scrubRequested pilote la décision binaire. Les granularités (pii,
    // hostnames, clientNames) sont interprétées par le seed DB (déjà fait).
    void activeScrub;

    // -- Cache lookup par provider (scrubbing peut différer selon provider
    // cloud vs local → hash différent → entrées cache distinctes). ------
    const attemptPromptHash = hashPrompt(messages);
    finalPromptHash = attemptPromptHash;
    if (cacheTtlMs > 0) {
      const hit = getCached(task.policy.feature, model, attemptPromptHash);
      if (hit) {
        const finalContent = scrubMap
          ? deanonymize(scrubMap, hit.content)
          : hit.content;
        return await logAndReturn(
          {
            ok: true,
            content: finalContent,
            provider: "cache",
            modelName: hit.modelName,
            promptTokens: hit.promptTokens,
            responseTokens: hit.responseTokens,
            costCents: 0,
            latencyMs: Date.now() - t0,
          },
          task,
          {
            provider: "cache",
            modelName: hit.modelName,
            scrubApplied: scrubRequested,
            status: "ok",
            promptTokens: hit.promptTokens,
            responseTokens: hit.responseTokens,
            costCents: 0,
            response: finalContent,
          },
        );
      }
    }

    let resp: import("./types").ProviderResponse;
    try {
      resp = await provider.chat({
        messages,
        model,
        temperature: task.policy.temperature,
        maxTokens: task.policy.maxTokens,
        responseFormat: task.policy.responseFormat,
        timeoutMs: task.policy.timeoutMs ?? 30_000,
        enablePromptCaching: task.policy.enablePromptCaching,
      });
    } catch (err) {
      const isTimeout =
        err instanceof Error &&
        (err.name === "AbortError" || /timeout|aborted/i.test(err.message));
      return await logAndReturn(
        {
          ok: false,
          latencyMs: Date.now() - t0,
          error: {
            kind: isTimeout ? "timeout" : "provider_error",
            reason: err instanceof Error ? err.message : String(err),
          },
        },
        task,
        {
          provider: provider.kind,
          modelName: model,
          scrubApplied: scrubRequested,
          status: isTimeout ? "timeout" : "error",
        },
      );
    }

    // Validation optionnelle — si le validateur rejette, on considère que
    // la réponse est inexploitable (JSON invalide, schéma non conforme).
    if (task.responseValidator && !task.responseValidator(resp.content)) {
      parseFailureCount++;
      console.warn(
        `[ai-orchestrator] parse_failure sur ${task.policy.feature} via ${provider.kind}/${model} — tentative de retry cross-provider`,
      );
      // Log la tentative échouée pour visibilité dashboard (sans invocationId
      // retourné — c'est un log diagnostic, pas le résultat final).
      await logAndReturn(
        {
          ok: false,
          latencyMs: Date.now() - t0,
          error: {
            kind: "parse_failure",
            reason: `Réponse invalide (${resp.content.slice(0, 200)}...)`,
          },
        },
        task,
        {
          provider: provider.kind,
          modelName: resp.modelName,
          scrubApplied: scrubRequested,
          status: "parse_failure",
          promptTokens: resp.promptTokens,
          responseTokens: resp.responseTokens,
          response: resp.content.slice(0, 500),
        },
      );
      excludedProviders.add(provider.kind);
      continue; // essaie provider suivant
    }

    providerResponse = resp;
    break;
  }

  // À ce stade, si providerResponse est absent mais on est sorti de la
  // boucle, c'est qu'on a épuisé les providers ET le dernier retry a réussi
  // son appel sans validator ou après validator OK — donc ça ne devrait pas
  // arriver. Sécurité :
  if (!providerResponse || !lastProvider) {
    return await logAndReturn(
      {
        ok: false,
        latencyMs: Date.now() - t0,
        error: {
          kind: "parse_failure",
          reason: `Échec validation sur tous les providers tentés`,
        },
      },
      task,
      {
        provider: lastProvider?.kind ?? task.policy.allowedProviders[0],
        modelName: lastModel,
        scrubApplied: finalScrubRequested,
        status: "parse_failure",
      },
    );
  }
  const provider = lastProvider as import("./types").AiProvider;
  const model = lastModel;
  const scrubRequested = finalScrubRequested;
  const cachedPromptHash = finalPromptHash;
  // Garde une référence aux messages scrubbés pour d'éventuels usages
  // futurs (ex: replay debug). Non utilisé actuellement.
  void finalMessages;

  // -- 5. Dé-anonymisation --------------------------------------------------
  let content = providerResponse.content;
  if (scrubMap) {
    content = deanonymize(scrubMap, content);
  }

  // -- 5b. Cache store (avant dé-anonymisation pour les hits ultérieurs)
  // On cache la version encore anonymisée : rejouer un hit refera la
  // dé-anonymisation avec le scrubMap courant (placeholders stables).
  if (cacheTtlMs > 0) {
    setCached(task.policy.feature, model, cachedPromptHash, {
      content: providerResponse.content,
      modelName: providerResponse.modelName,
      promptTokens: providerResponse.promptTokens,
      responseTokens: providerResponse.responseTokens,
      costCents: 0,
      ttlMs: cacheTtlMs,
    });
  }

  // -- 6. Budget check (warn only, on n'interrompt pas une réponse déjà reçue)
  const costCents =
    providerResponse.promptTokens && providerResponse.responseTokens
      ? provider.estimateCostCents(
          providerResponse.promptTokens,
          providerResponse.responseTokens,
          providerResponse.modelName,
        )
      : 0;
  if (
    task.policy.costBudgetCents != null &&
    costCents > task.policy.costBudgetCents
  ) {
    console.warn(
      `[ai-orchestrator] budget dépassé pour ${task.policy.feature}: ${costCents}¢ > ${task.policy.costBudgetCents}¢`,
    );
  }

  // -- 7. Log AiInvocation + retour -----------------------------------------
  return await logAndReturn(
    {
      ok: true,
      content,
      provider: provider.kind,
      modelName: providerResponse.modelName,
      promptTokens: providerResponse.promptTokens,
      responseTokens: providerResponse.responseTokens,
      costCents,
      latencyMs: Date.now() - t0,
    },
    task,
    {
      provider: provider.kind,
      modelName: providerResponse.modelName,
      scrubApplied: scrubRequested,
      status: "ok",
      promptTokens: providerResponse.promptTokens,
      responseTokens: providerResponse.responseTokens,
      costCents,
      response: content,
    },
  );
}

/**
 * Enregistre l'invocation pour audit (Loi 25) + calibration. Non bloquant :
 * si le write DB échoue, on log et on retourne quand même le résultat à
 * l'appelant (UX > audit strict). On pourra rattraper via un retry worker.
 */
async function logAndReturn(
  result: AiResult,
  task: AiTask,
  meta: {
    provider: string;
    modelName: string;
    scrubApplied: boolean;
    status: string;
    promptTokens?: number;
    responseTokens?: number;
    costCents?: number;
    response?: string;
  },
): Promise<AiResult> {
  try {
    const promptHash = hashPrompt(task.messages);
    const row = await prisma.aiInvocation.create({
      data: {
        feature: task.policy.feature,
        taskKind: task.taskKind ?? "chat",
        userId: task.context?.userId ?? null,
        ticketId: task.context?.ticketId ?? null,
        organizationId: task.context?.organizationId ?? null,
        policyJson: task.policy as unknown as import("@prisma/client").Prisma.InputJsonValue,
        provider: meta.provider,
        modelName: meta.modelName,
        sensitivityLevel: task.policy.sensitivity,
        scrubApplied: meta.scrubApplied,
        promptHash,
        promptTokens: meta.promptTokens ?? null,
        responseTokens: meta.responseTokens ?? null,
        costCents: meta.costCents ?? null,
        latencyMs: result.latencyMs,
        status: meta.status,
        blockedReason:
          result.error && result.error.kind === "blocked"
            ? result.error.reason
            : null,
        response: meta.response ?? null,
        promptVersion: task.policy.promptVersion ?? null,
      },
      select: { id: true },
    });
    return { ...result, invocationId: row.id };
  } catch (err) {
    console.warn("[ai-orchestrator] audit log failed:", err);
    return result;
  }
}

function failSync(reason: string, t0: number): AiResult {
  return {
    ok: false,
    latencyMs: Date.now() - t0,
    error: { kind: "blocked", reason },
  };
}

function hashPrompt(messages: AiMessage[]): string {
  const h = crypto.createHash("sha256");
  for (const m of messages) {
    h.update(m.role);
    h.update("|");
    h.update(m.content);
    h.update("\n");
  }
  return h.digest("hex");
}

/**
 * Enregistre l'action humaine prise sur une suggestion IA. Appelé par
 * l'UI quand l'utilisateur accepte / édite / rejette une proposition.
 * Alimente la calibration et les métriques d'amélioration continue.
 */
export async function recordHumanAction(args: {
  invocationId: string;
  action: "accepted" | "edited" | "rejected";
  edit?: string;
}): Promise<void> {
  try {
    await prisma.aiInvocation.update({
      where: { id: args.invocationId },
      data: {
        humanAction: args.action,
        humanEdit: args.edit ?? null,
        actedAt: new Date(),
      },
    });
  } catch (err) {
    console.warn("[ai-orchestrator] recordHumanAction failed:", err);
  }
}

// Re-export des helpers utiles pour les features
export type { AiTask, AiResult, AiPolicy, AiTaskContext, AiMessage };
