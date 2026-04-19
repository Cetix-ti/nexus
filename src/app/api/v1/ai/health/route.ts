// ============================================================================
// GET /api/v1/ai/health
//
// État des providers IA — ping chaque provider configuré, retourne sa
// disponibilité, le modèle par défaut, et la latence de ping.
//
// Utilisé par le dashboard admin IA (badge coloré à côté de chaque
// feature) et par le monitoring. Accessible à TECHNICIAN+ (pas de secret
// exposé).
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getProvider } from "@/lib/ai/orchestrator/router";

interface ProviderHealth {
  kind: "openai" | "anthropic" | "ollama" | "local";
  available: boolean;
  defaultModel: string | null;
  latencyMs: number;
  error?: string;
}

function defaultModelFor(kind: ProviderHealth["kind"]): string {
  switch (kind) {
    case "openai":
      return process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    case "anthropic":
      return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
    case "ollama":
    case "local":
      return process.env.OLLAMA_MODEL || "llama3.1:8b";
  }
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_") || me.role === "READ_ONLY") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const kinds: Array<"openai" | "anthropic" | "ollama"> = [
    "openai",
    "anthropic",
    "ollama",
  ];
  const checks = await Promise.all(
    kinds.map(async (kind): Promise<ProviderHealth> => {
      const provider = getProvider(kind);
      const t0 = Date.now();
      try {
        const available = await provider.isAvailable();
        return {
          kind,
          available,
          defaultModel: defaultModelFor(kind),
          latencyMs: Date.now() - t0,
        };
      } catch (err) {
        return {
          kind,
          available: false,
          defaultModel: null,
          latencyMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  return NextResponse.json({
    providers: checks,
    config: {
      ollamaUrl,
      openaiModel: defaultModelFor("openai"),
      anthropicModel: defaultModelFor("anthropic"),
      ollamaModel: defaultModelFor("ollama"),
      anyAvailable: checks.some((c) => c.available),
      allAvailable: checks.every((c) => c.available),
    },
    checkedAt: new Date().toISOString(),
  });
}
