// ============================================================================
// Provider OpenAI — HTTP direct vers /chat/completions (aucun SDK pour
// garder le code léger et swappable). Le modèle est choisi par
// AI_MODEL (défaut gpt-4o-mini) ou par l'argument `model`.
// ============================================================================

import type { AiProvider, AiMessage, ProviderResponse } from "../types";

const API_URL = () =>
  process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = () => process.env.AI_MODEL || "gpt-4o-mini";

// Tarifs indicatifs en cents / 1M tokens — mis à jour périodiquement.
// Ces chiffres sont VOLONTAIREMENT conservateurs ; mieux vaut surestimer
// le coût que sous-estimer dans les budgets par client.
const PRICING: Record<string, { prompt: number; response: number }> = {
  "gpt-4o-mini": { prompt: 15, response: 60 },
  "gpt-4o": { prompt: 250, response: 1000 },
  "gpt-4.1-mini": { prompt: 40, response: 160 },
  "o1-mini": { prompt: 300, response: 1200 },
};
const DEFAULT_PRICING = { prompt: 100, response: 400 };

export class OpenAiProvider implements AiProvider {
  readonly kind = "openai" as const;

  async isAvailable(): Promise<boolean> {
    return !!process.env.OPENAI_API_KEY;
  }

  async chat(args: {
    messages: AiMessage[];
    model: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "text" | "json_object";
    timeoutMs?: number;
  }): Promise<ProviderResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY non configurée");

    const modelName = args.model || DEFAULT_MODEL();

    // Timeout via AbortController — évite que l'orchestrateur attende
    // indéfiniment si l'API est lente.
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      args.timeoutMs ?? 30_000,
    );

    try {
      const res = await fetch(API_URL(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages: args.messages,
          temperature: args.temperature ?? 0.3,
          max_tokens: args.maxTokens ?? 4096,
          // Flag clé : on NE veut PAS qu'OpenAI stocke les prompts (Loi 25,
          // minimisation). Dispo depuis fin 2024 sur l'API.
          store: false,
          ...(args.responseFormat === "json_object"
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI ${res.status}: ${text}`);
      }
      const data = await res.json();
      return {
        content: data.choices?.[0]?.message?.content ?? "",
        modelName,
        promptTokens: data.usage?.prompt_tokens,
        responseTokens: data.usage?.completion_tokens,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  estimateCostCents(
    promptTokens: number,
    responseTokens: number,
    model: string,
  ): number {
    const p = PRICING[model] ?? DEFAULT_PRICING;
    // Convertit cents/1M tokens en cents (arrondit à l'entier supérieur).
    const costRaw =
      (promptTokens * p.prompt + responseTokens * p.response) / 1_000_000;
    return Math.max(1, Math.ceil(costRaw));
  }
}
