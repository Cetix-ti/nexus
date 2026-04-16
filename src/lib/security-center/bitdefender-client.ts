// ============================================================================
// BITDEFENDER GRAVITYZONE API CLIENT
//
// Auth : l'API GravityZone utilise HTTP Basic avec le token comme username
// (pas de password). Le token vit dans BITDEFENDER_API_KEY (env).
//
// Endpoints principaux que nous utilisons :
//   - POST /api/v1.0/jsonrpc/push                 → configurer le webhook
//                                                    (non utilisé ici — pull)
//   - POST /api/v1.0/jsonrpc/events               → listes d'événements
//   - POST /api/v1.0/jsonrpc/companies             → pour multitenant (plus tard)
//
// Protocole : JSON-RPC 2.0. Payload = { id, jsonrpc, method, params }.
//
// Stratégie simple : pull régulier (toutes les 10 min) des événements
// depuis le dernier "since" connu (stocké en tenant_settings).
// ============================================================================

import prisma from "@/lib/prisma";

const CONFIG_KEY = "security.bitdefender";

export interface BitdefenderConfig {
  /** URL racine de l'instance (ex: https://cloudgz.gravityzone.bitdefender.com). */
  apiUrl: string;
  /** Token API utilisé comme username en HTTP Basic (mot de passe vide). */
  apiKey: string;
  /** ISO8601 du dernier événement connu — on interroge avec `from`=lastSyncAt. */
  lastSyncAt?: string;
}

export async function getBitdefenderConfig(): Promise<BitdefenderConfig | null> {
  const apiKey = process.env.BITDEFENDER_API_KEY?.trim();
  const apiUrl = (process.env.BITDEFENDER_API_URL?.trim() ||
    "https://cloudgz.gravityzone.bitdefender.com").replace(/\/$/, "");
  if (!apiKey) return null;

  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  const stored = (row?.value as Partial<BitdefenderConfig> | null) ?? {};
  return {
    apiUrl,
    apiKey,
    lastSyncAt: stored.lastSyncAt,
  };
}

export async function saveBitdefenderLastSync(iso: string): Promise<void> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  const current = (row?.value as Record<string, unknown> | null) ?? {};
  await prisma.tenantSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: { ...current, lastSyncAt: iso } as never },
    update: { value: { ...current, lastSyncAt: iso } as never },
  });
}

/**
 * Appel JSON-RPC générique. Retourne `result` ou throw.
 */
async function jsonrpc<T = unknown>(
  cfg: BitdefenderConfig,
  path: string,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const url = `${cfg.apiUrl}/api/v1.0/jsonrpc${path}`;
  const authHeader = `Basic ${Buffer.from(`${cfg.apiKey}:`).toString("base64")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: Date.now(),
      jsonrpc: "2.0",
      method,
      params,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Bitdefender HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  if ((body as { error?: unknown }).error) {
    throw new Error(
      `Bitdefender RPC error: ${JSON.stringify((body as { error: unknown }).error).slice(0, 500)}`,
    );
  }
  return (body as { result: T }).result;
}

/**
 * Récupère les événements depuis `since`. Retourne la liste brute —
 * c'est le décodeur qui transforme en DecodedAlert.
 *
 * NB: la méthode exacte dépend de la version d'API et des services
 * activés. On privilégie `getPushEventsSchedule` seulement pour test ;
 * pour le pull récurrent on utilise `getEvents` (méthode commune à la
 * plupart des modules).
 */
export async function fetchBitdefenderEvents(
  cfg: BitdefenderConfig,
  since?: string,
): Promise<Record<string, unknown>[]> {
  // L'API GravityZone v6+ retourne `result.items`. On demande 500 events
  // max par appel ; si plus, la prochaine sync (10 min plus tard) prendra
  // le reste.
  try {
    const result = await jsonrpc<{ items?: Record<string, unknown>[] }>(
      cfg,
      "/events",
      "getEvents",
      {
        page: 1,
        perPage: 500,
        ...(since ? { filters: { from: since } } : {}),
      },
    );
    return Array.isArray(result?.items) ? result.items : [];
  } catch (err) {
    console.error("[bitdefender] fetch events failed:", err);
    return [];
  }
}
