// ============================================================================
// Provider Anthropic — HTTP direct vers /v1/messages. Introduit le **prompt
// caching natif** (cache_control ephemeral) : sur les features à system
// prompt stable et volumineux (triage avec taxonomie, risk_analysis avec
// contexte org complet, monthly_report), Anthropic facture 0.1× le prix
// input pour les tokens re-lus → 90% d'économie sur le contexte répété.
//
// La fenêtre de cache est de 5 min par défaut côté Anthropic ; une seconde
// invocation dans cet intervalle avec le même préfixe stable = cache hit.
//
// Différences clés avec OpenAI :
//   - `system` est un champ dédié (pas un message role="system")
//   - Pas de `response_format: json_object` natif → on instruit + on prefill
//   - Usage retourne aussi cache_creation_input_tokens / cache_read_input_tokens
// ============================================================================

import type { AiProvider, AiMessage, ProviderResponse } from "../types";

const API_URL = () =>
  process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = () =>
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const API_VERSION = "2023-06-01";

// Tarifs en cents / 1M tokens (input et output). Cache write = 1.25× input,
// cache read = 0.1× input. Valeurs conservatrices alignées sur les prix
// publics Anthropic au 2026-Q1 — à ré-auditer si Anthropic publie nouveaux
// palier.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 1500, output: 7500 },
  "claude-opus-4-1": { input: 1500, output: 7500 },
  "claude-sonnet-4-6": { input: 300, output: 1500 },
  "claude-sonnet-4-5": { input: 300, output: 1500 },
  "claude-haiku-4-5": { input: 100, output: 500 },
  "claude-haiku-4-5-20251001": { input: 100, output: 500 },
};
const DEFAULT_PRICING = { input: 300, output: 1500 };

// Seuil (en chars) à partir duquel on applique cache_control sur le system
// prompt. Anthropic a un minimum cacheable (~1024 tokens ≈ 4000 chars pour
// du texte FR/EN mixte). En-dessous, la clé cache_control est ignorée mais
// peut produire une erreur "Invalid request" selon version API. On garde
// large (5000 chars ≈ 1250 tokens) pour être sûr.
const MIN_CACHE_CHARS = 5000;

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  usage?: AnthropicUsage;
  stop_reason?: string;
}

export class AnthropicProvider implements AiProvider {
  readonly kind = "anthropic" as const;

  async isAvailable(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async chat(args: {
    messages: AiMessage[];
    model: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "text" | "json_object";
    timeoutMs?: number;
    enablePromptCaching?: boolean;
  }): Promise<ProviderResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");

    const modelName = args.model || DEFAULT_MODEL();

    // Extraction du system prompt (Anthropic le veut séparé). On concatène
    // plusieurs messages system si présents — rare mais supporté.
    const systemParts: string[] = [];
    const convoMessages: AiMessage[] = [];
    for (const m of args.messages) {
      if (m.role === "system") systemParts.push(m.content);
      else convoMessages.push(m);
    }
    const systemText = systemParts.join("\n\n");

    // Mode JSON : Anthropic n'a pas de flag natif. On renforce l'instruction
    // dans le system prompt ; le caller utilise déjà tryParseJson() qui
    // tolère les fences markdown au besoin.
    const finalSystemText =
      args.responseFormat === "json_object"
        ? `${systemText}\n\nIMPORTANT: Répond UNIQUEMENT avec un objet JSON valide, sans préambule ni texte hors JSON, sans bloc markdown.`
        : systemText;

    // Prompt caching : on marque le system prompt comme ephemeral si assez
    // long ET si la policy l'active. Gain typique : 90% sur l'input répété
    // pour les 5 minutes suivantes.
    const shouldCache =
      args.enablePromptCaching === true &&
      finalSystemText.length >= MIN_CACHE_CHARS;

    const systemField = shouldCache
      ? [
          {
            type: "text",
            text: finalSystemText,
            cache_control: { type: "ephemeral" },
          },
        ]
      : finalSystemText || undefined;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      args.timeoutMs ?? 30_000,
    );

    try {
      const body: Record<string, unknown> = {
        model: modelName,
        max_tokens: args.maxTokens ?? 4096,
        temperature: args.temperature ?? 0.3,
        messages: convoMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };
      if (systemField !== undefined) body.system = systemField;

      const headers: Record<string, string> = {
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      };

      const res = await fetch(API_URL(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic ${res.status}: ${text}`);
      }

      const data = (await res.json()) as AnthropicResponse;
      const content =
        data.content
          ?.filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("") ?? "";

      const u = data.usage ?? {};
      // On agrège les 3 compteurs input en un seul `promptTokens` pour
      // compatibilité avec le schéma AiInvocation existant. Le coût réel
      // est calculé séparément dans estimateCostCents() qui reçoit le
      // total — si besoin, on affinera plus tard en propageant les buckets.
      const totalInput =
        (u.input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0);

      if (shouldCache && (u.cache_read_input_tokens ?? 0) > 0) {
        console.log(
          `[anthropic] cache hit: ${u.cache_read_input_tokens} tokens lus (${modelName})`,
        );
      }

      return {
        content,
        modelName: data.model ?? modelName,
        promptTokens: totalInput > 0 ? totalInput : undefined,
        responseTokens: u.output_tokens,
        // Métadonnées étendues pour l'orchestrateur (caché sur ProviderResponse
        // via cast — le type public reste minimal).
        ...({
          cacheCreationTokens: u.cache_creation_input_tokens,
          cacheReadTokens: u.cache_read_input_tokens,
        } as Record<string, unknown>),
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
    // Sans les buckets cache détaillés ici, on applique le tarif input plein.
    // Sous-estime jamais — cache = moins cher = on surestime, OK pour budget.
    const costRaw =
      (promptTokens * p.input + responseTokens * p.output) / 1_000_000;
    return Math.max(1, Math.ceil(costRaw));
  }

  /**
   * Calcul affiné quand les buckets cache sont connus — appelé par
   * l'orchestrateur quand disponible.
   */
  estimateCostCentsDetailed(
    regularInput: number,
    cacheCreation: number,
    cacheRead: number,
    output: number,
    model: string,
  ): number {
    const p = PRICING[model] ?? DEFAULT_PRICING;
    const costRaw =
      (regularInput * p.input +
        cacheCreation * p.input * 1.25 +
        cacheRead * p.input * 0.1 +
        output * p.output) /
      1_000_000;
    return Math.max(1, Math.ceil(costRaw));
  }
}
