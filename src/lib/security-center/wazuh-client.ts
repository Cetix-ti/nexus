// ============================================================================
// WAZUH INDEXER CLIENT
//
// On tape directement le Wazuh Indexer (fork OpenSearch, port 9200 par
// défaut) sur l'index `wazuh-alerts-*`. C'est là que le manager Wazuh
// écrit toutes les alertes en JSON structuré — infiniment plus propre
// que parser les notifications email.
//
// Auth : HTTP Basic avec un user dédié (créer "nexus-reader" dans le
// Wazuh Dashboard → Security → Internal users, rôle "kibana_user"
// + back-end role "readall"). Stocker les creds côté tenant_settings.
//
// Config : `security.wazuh` tenant-setting + fallback env. Structure :
//   {
//     apiUrl: "https://wazuh-indexer.cetix.local:9200"
//     username: "nexus-reader"
//     password: "****"
//     minLevel: 7            // filtre rule.level >= N pour le bruit
//     enabled: true
//     lastSyncAt: ISO        // cursor du dernier pull
//   }
//
// L'implémentation ignore la validation des certificats en dev (env
// NODE_TLS_REJECT_UNAUTHORIZED=0 déjà utilisé ailleurs) — en prod,
// provisionner un CA valide sur le Wazuh Indexer.
// ============================================================================

import prisma from "@/lib/prisma";

const CONFIG_KEY = "security.wazuh";

export interface WazuhConfig {
  enabled: boolean;
  apiUrl: string;
  username: string;
  password: string;
  /**
   * Seuil de sévérité (rule.level). Par défaut 7, ce qui coupe les
   * alertes informationnelles (1-4) et les notifications système bas
   * niveau (5-6). 10+ = critique.
   */
  minLevel: number;
  lastSyncAt?: string;
}

export const DEFAULT_WAZUH_CONFIG: WazuhConfig = {
  enabled: false,
  apiUrl: "",
  username: "",
  password: "",
  minLevel: 7,
};

export async function getWazuhConfig(): Promise<WazuhConfig> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  const stored = (row?.value as Partial<WazuhConfig> | null) ?? {};
  // Fallback env pour déploiements sans UI (ex: bootstrap first time).
  const envUrl = process.env.WAZUH_API_URL?.trim();
  const envUser = process.env.WAZUH_API_USER?.trim();
  const envPass = process.env.WAZUH_API_PASSWORD?.trim();
  return {
    enabled: stored.enabled ?? (envUrl ? true : DEFAULT_WAZUH_CONFIG.enabled),
    apiUrl: stored.apiUrl || envUrl || DEFAULT_WAZUH_CONFIG.apiUrl,
    username: stored.username || envUser || DEFAULT_WAZUH_CONFIG.username,
    password: stored.password || envPass || DEFAULT_WAZUH_CONFIG.password,
    minLevel: stored.minLevel ?? DEFAULT_WAZUH_CONFIG.minLevel,
    lastSyncAt: stored.lastSyncAt,
  };
}

export async function saveWazuhConfig(patch: Partial<WazuhConfig>): Promise<WazuhConfig> {
  const current = await getWazuhConfig();
  const next: WazuhConfig = {
    enabled: patch.enabled ?? current.enabled,
    apiUrl: (patch.apiUrl ?? current.apiUrl).replace(/\/$/, ""),
    username: patch.username ?? current.username,
    password: patch.password ?? current.password,
    minLevel: patch.minLevel ?? current.minLevel,
    lastSyncAt: patch.lastSyncAt ?? current.lastSyncAt,
  };
  await prisma.tenantSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: next as never },
    update: { value: next as never },
  });
  return next;
}

// ---------------------------------------------------------------------------
// Alert fetching — OpenSearch query DSL
// ---------------------------------------------------------------------------

/**
 * Structure minimale d'un doc Wazuh. On ne tape pas tout parce que le
 * schéma varie selon la source (vulnerability-detector, syscheck, auth,
 * brute_force…). Le décodeur extrait ce dont il a besoin.
 */
export interface WazuhAlert {
  _id: string;
  _index?: string;
  _source: {
    timestamp: string;
    rule?: {
      id?: string;
      level?: number;
      description?: string;
      groups?: string[];
      firedtimes?: number;
      mitre?: { id?: string[]; tactic?: string[]; technique?: string[] };
    };
    agent?: {
      id?: string;
      name?: string;
      ip?: string;
      labels?: Record<string, string>;
    };
    manager?: { name?: string };
    location?: string;
    decoder?: { name?: string };
    data?: Record<string, unknown>;
    full_log?: string;
    syscheck?: Record<string, unknown>;
  };
}

export interface WazuhFetchResult {
  alerts: WazuhAlert[];
  total: number;
}

function authHeader(cfg: WazuhConfig): string {
  return `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64")}`;
}

/**
 * Interroge l'Indexer pour les alertes > `since` (ISO) avec `rule.level`
 * >= `minLevel`. Trie par timestamp ascendant pour itérer par cursor.
 * Taille max par appel : 500 (raisonnable pour un pull toutes les 2 min).
 */
export async function fetchWazuhAlerts(
  cfg: WazuhConfig,
  options: { since?: string; size?: number } = {},
): Promise<WazuhFetchResult> {
  const since = options.since;
  const size = Math.min(options.size ?? 500, 5000);

  const query: Record<string, unknown> = {
    bool: {
      must: [
        { range: { "rule.level": { gte: cfg.minLevel } } },
        ...(since ? [{ range: { timestamp: { gt: since } } }] : []),
      ],
    },
  };

  const body = {
    query,
    sort: [{ timestamp: "asc" as const }],
    size,
  };

  const res = await fetch(`${cfg.apiUrl}/wazuh-alerts-*/_search`, {
    method: "POST",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Wazuh Indexer HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const json = await res.json();
  const hits = (json?.hits?.hits ?? []) as WazuhAlert[];
  const total = typeof json?.hits?.total === "number"
    ? json.hits.total
    : json?.hits?.total?.value ?? hits.length;
  return { alerts: hits, total };
}

/**
 * Test de connexion — vérifie auth + cluster health. Retourne la
 * version + cluster_name si OK, ou l'erreur décrite.
 */
export async function testWazuhConnection(
  cfg: WazuhConfig,
): Promise<{ ok: boolean; version?: string; clusterName?: string; error?: string }> {
  try {
    const res = await fetch(`${cfg.apiUrl}/`, {
      method: "GET",
      headers: { Authorization: authHeader(cfg) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const info = await res.json();
    return {
      ok: true,
      version: info?.version?.number,
      clusterName: info?.cluster_name,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
