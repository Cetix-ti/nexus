// ============================================================================
// Provider Ollama — appelle un serveur Ollama local (défaut :
// http://localhost:11434). Installé sur le serveur Nexus via GPU P6000
// pour les tâches sensibles ou à fort volume où on ne veut pas payer
// l'OpenAI ni exposer de données au cloud.
//
// Le modèle par défaut (OLLAMA_MODEL env, ou "llama3.1:8b") doit avoir été
// téléchargé au préalable via `ollama pull llama3.1:8b`. L'orchestrateur
// vérifie la disponibilité du modèle au démarrage et bascule sur OpenAI
// si le provider Ollama n'est pas joignable, sauf si la policy interdit
// explicitement cloud (sensitivity=regulated).
// ============================================================================

import type { AiProvider, AiMessage, ProviderResponse } from "../types";

const OLLAMA_URL = () => process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = () => process.env.OLLAMA_MODEL || "llama3.1:8b";

/**
 * Combien de temps Ollama doit-il garder le modèle chargé en VRAM après un
 * appel ? Par défaut, Ollama décharge après 5 minutes d'inactivité — avec
 * gemma3:12b qui prend 10-15 secondes à reload, ça produit des "cold starts"
 * frustrants pour le premier appel après une pause.
 *
 * On demande 30 min via `keep_alive`. Si tu veux garder le modèle en VRAM
 * indéfiniment : `OLLAMA_KEEP_ALIVE=-1m` (valeur négative = sans expiration).
 * Si tu veux libérer plus vite (plusieurs modèles partagent la VRAM) :
 * OLLAMA_KEEP_ALIVE=5m ou moins.
 */
const KEEP_ALIVE = () => process.env.OLLAMA_KEEP_ALIVE || "30m";

export class OllamaProvider implements AiProvider {
  readonly kind = "ollama" as const;
  private availabilityCache: {
    ok: boolean;
    at: number;
    availableModels: Set<string>;
  } | null = null;

  async isAvailable(): Promise<boolean> {
    // Cache 30s pour ne pas pinger à chaque appel.
    const cached = this.availabilityCache;
    if (cached && Date.now() - cached.at < 30_000) return cached.ok;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      const res = await fetch(`${OLLAMA_URL()}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        this.availabilityCache = { ok: false, at: Date.now(), availableModels: new Set() };
        return false;
      }
      // Extrait les modèles disponibles pour permettre au router de skipper
      // proprement si un modèle spécifique (ex: OLLAMA_MODEL_SMALL) n'est
      // pas pull. Avant : le premier appel échouait avec 500.
      const data = await res.json().catch(() => ({ models: [] }));
      const availableModels = new Set<string>(
        Array.isArray(data.models)
          ? data.models.map((m: { name?: string }) => m.name ?? "").filter(Boolean)
          : [],
      );
      this.availabilityCache = { ok: true, at: Date.now(), availableModels };
      return true;
    } catch {
      this.availabilityCache = { ok: false, at: Date.now(), availableModels: new Set() };
      return false;
    }
  }

  /**
   * Retourne la liste des modèles actuellement installés dans Ollama. Utile
   * pour le router qui peut fallback sur le modèle principal si le petit
   * modèle n'est pas pull.
   */
  async listModels(): Promise<Set<string>> {
    await this.isAvailable(); // peuple le cache si nécessaire
    return new Set(this.availabilityCache?.availableModels ?? []);
  }

  async chat(args: {
    messages: AiMessage[];
    model: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "text" | "json_object";
    timeoutMs?: number;
  }): Promise<ProviderResponse> {
    const modelName = args.model || DEFAULT_MODEL();

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      args.timeoutMs ?? 60_000, // Ollama peut être plus lent qu'OpenAI sur du petit matériel
    );

    try {
      const res = await fetch(`${OLLAMA_URL()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: args.messages,
          stream: false,
          keep_alive: KEEP_ALIVE(),
          options: {
            temperature: args.temperature ?? 0.3,
            num_predict: args.maxTokens ?? 2048,
          },
          // Ollama supporte un format JSON forcé via `format: "json"`. Le
          // modèle tente de sortir un JSON valide — pas garanti strict
          // comme OpenAI json_object, mais suffisant pour nos cas.
          ...(args.responseFormat === "json_object" ? { format: "json" } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama ${res.status}: ${text}`);
      }
      const data = await res.json();
      return {
        content: data.message?.content ?? "",
        modelName,
        promptTokens: data.prompt_eval_count,
        responseTokens: data.eval_count,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  estimateCostCents(): number {
    // Self-hosted → pas de coût marginal. On retourne 0 pour que les
    // analyses budgétaires montrent clairement l'économie réalisée.
    return 0;
  }

  /**
   * Génère un vecteur d'embedding pour un texte via le modèle d'embedding
   * configuré (défaut : nomic-embed-text, 768 dimensions). Renvoie null en
   * cas d'échec — le caller décide du fallback.
   *
   * Le modèle DOIT avoir été pull préalablement (`ollama pull
   * nomic-embed-text`). Pour changer : OLLAMA_EMBED_MODEL=mxbai-embed-large.
   */
  async embed(
    text: string,
    model?: string,
  ): Promise<number[] | null> {
    if (!text || text.trim().length === 0) return null;
    const embedModel =
      model || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
    try {
      const res = await fetch(`${OLLAMA_URL()}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: embedModel,
          input: text.slice(0, 8000), // nomic-embed-text max ~8k tokens
          keep_alive: KEEP_ALIVE(),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      // /api/embed renvoie { embeddings: [[...]] } (batch) — on prend le 1er.
      const vec = Array.isArray(data.embeddings?.[0])
        ? (data.embeddings[0] as number[])
        : Array.isArray(data.embedding)
          ? (data.embedding as number[])
          : null;
      return vec;
    } catch {
      return null;
    }
  }

  /**
   * Chauffe le modèle en mémoire VRAM sans générer de tokens. Envoie une
   * requête `/api/generate` vide avec `keep_alive` long — Ollama charge le
   * modèle et le garde. À appeler au boot du serveur Nexus puis toutes les
   * ~25 minutes pour que le modèle reste en VRAM (cf. KEEP_ALIVE = 30m).
   *
   * Retourne true si le warm-up a réussi. Ne throw jamais.
   */
  async warmUp(model?: string): Promise<boolean> {
    const modelName = model || DEFAULT_MODEL();
    try {
      const res = await fetch(`${OLLAMA_URL()}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          prompt: "",
          keep_alive: KEEP_ALIVE(),
        }),
        // 20s — laisse le temps de charger 8GB de VRAM au premier appel
        signal: AbortSignal.timeout(20_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
