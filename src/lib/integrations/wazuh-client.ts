// ============================================================================
// WAZUH SIEM API CLIENT
// Authenticates via JWT (auto-renewed), fetches agents and software inventory
// ============================================================================

const WAZUH_URL = process.env.WAZUH_API_URL;
const WAZUH_USER = process.env.WAZUH_API_USER;
const WAZUH_PASSWORD = process.env.WAZUH_API_PASSWORD;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Authenticate and return a valid JWT token.
 * Tokens are cached and auto-renewed (Wazuh default TTL = 900s).
 */
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  if (!WAZUH_URL || !WAZUH_USER || !WAZUH_PASSWORD) {
    throw new Error(
      "WAZUH_API_URL, WAZUH_API_USER et WAZUH_API_PASSWORD doivent être configurés dans .env"
    );
  }

  const res = await fetch(
    `${WAZUH_URL}/security/user/authenticate?raw=true`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${WAZUH_USER}:${WAZUH_PASSWORD}`).toString("base64"),
      },
      // Self-signed certs are common for Wazuh
      ...(process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ? {} : {}),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Wazuh auth failed (${res.status}): ${text}`);
  }

  const token = await res.text();
  cachedToken = token.trim();
  // Renew 60s before expiry (default TTL = 900s)
  tokenExpiresAt = Date.now() + 840_000;
  return cachedToken;
}

/**
 * Make an authenticated GET request to the Wazuh API.
 */
async function wazuhFetch<T>(endpoint: string): Promise<T> {
  const token = await getToken();
  const url = `${WAZUH_URL}${endpoint}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Wazuh API error ${res.status}: ${text || res.statusText}`);
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WazuhAgent {
  id: string;
  name: string;
  ip: string;
  status: string;
  os?: {
    name?: string;
    version?: string;
    platform?: string;
    arch?: string;
  };
  group?: string[];
  lastKeepAlive?: string;
}

export interface WazuhNetiface {
  name: string;
  mac: string;
  type: string;
  state: string;
  agent_id: string;
}

export interface WazuhPackage {
  name: string;
  version: string;
  vendor: string;
  architecture: string;
  install_time?: string;
  format?: string;
  agent_id: string;
}

interface WazuhResponse<T> {
  data: {
    affected_items: T[];
    total_affected_items: number;
  };
  error: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all Wazuh agents (active by default).
 */
export async function listWazuhAgents(
  status = "active",
): Promise<WazuhAgent[]> {
  const all: WazuhAgent[] = [];
  let offset = 0;
  const limit = 500;
  let total = Infinity;

  while (offset < total) {
    const res = await wazuhFetch<WazuhResponse<WazuhAgent>>(
      `/agents?status=${status}&limit=${limit}&offset=${offset}&select=id,name,ip,status,os,group,lastKeepAlive`,
    );
    all.push(...res.data.affected_items);
    total = res.data.total_affected_items;
    offset += limit;
  }

  return all;
}

/**
 * Get installed packages (software inventory) for a specific Wazuh agent.
 */
export async function getWazuhAgentPackages(
  agentId: string,
): Promise<WazuhPackage[]> {
  const all: WazuhPackage[] = [];
  let offset = 0;
  const limit = 500;
  let total = Infinity;

  while (offset < total) {
    const res = await wazuhFetch<WazuhResponse<WazuhPackage>>(
      `/syscollector/${agentId}/packages?limit=${limit}&offset=${offset}`,
    );
    all.push(...res.data.affected_items);
    total = res.data.total_affected_items;
    offset += limit;
  }

  return all;
}

const AGENT_SELECT = "id,name,ip,status,os,group,lastKeepAlive";

/**
 * Get network interfaces (MAC addresses) for a Wazuh agent.
 */
async function getAgentMacs(agentId: string): Promise<string[]> {
  try {
    const res = await wazuhFetch<WazuhResponse<WazuhNetiface>>(
      `/syscollector/${agentId}/netiface?select=mac&limit=20`,
    );
    return res.data.affected_items
      .map((n) => n.mac?.toUpperCase())
      .filter((m) => m && m !== "00:00:00:00:00:00");
  } catch {
    return [];
  }
}

/**
 * Verify a candidate Wazuh agent against an asset's MAC address.
 * Returns true if any MAC matches.
 */
async function verifyByMac(
  agentId: string,
  assetMac: string,
): Promise<boolean> {
  const macs = await getAgentMacs(agentId);
  return macs.includes(assetMac.toUpperCase());
}

type MatchMethod = "mac+hostname" | "mac+partial" | "hostname" | "partial";

/**
 * Find a Wazuh agent matching an asset using multiple strategies:
 *
 *  1. Exact hostname → verify by MAC (strongest match)
 *  2. Partial hostname search → verify by MAC (handles client-prefix naming)
 *  3. Exact hostname without MAC verification (fallback if no MAC available)
 *  4. Partial hostname without MAC verification (last resort)
 *
 * MAC verification prevents false positives when different clients
 * have the same internal IP ranges or similar hostnames.
 */
export async function findWazuhAgent(
  hostname: string,
  ipAddress?: string | null,
  macAddress?: string | null,
): Promise<{ agent: WazuhAgent; matchedBy: MatchMethod } | null> {
  const hasMac = !!macAddress;

  // Strategy 1: exact hostname → verify by MAC
  try {
    const res = await wazuhFetch<WazuhResponse<WazuhAgent>>(
      `/agents?name=${encodeURIComponent(hostname)}&select=${AGENT_SELECT}&limit=1`,
    );
    if (res.data.affected_items.length > 0) {
      const agent = res.data.affected_items[0];
      if (hasMac) {
        if (await verifyByMac(agent.id, macAddress!)) {
          return { agent, matchedBy: "mac+hostname" };
        }
        // MAC mismatch — wrong agent, continue
      } else {
        return { agent, matchedBy: "hostname" };
      }
    }
  } catch {
    // Continue
  }

  // Strategy 2: partial hostname search → verify by MAC
  try {
    const res = await wazuhFetch<WazuhResponse<WazuhAgent>>(
      `/agents?search=${encodeURIComponent(hostname)}&select=${AGENT_SELECT}&limit=10`,
    );
    for (const agent of res.data.affected_items) {
      if (hasMac) {
        if (await verifyByMac(agent.id, macAddress!)) {
          return { agent, matchedBy: "mac+partial" };
        }
      } else {
        // Without MAC, prefer active agents
        const active = res.data.affected_items.find((a) => a.status === "active");
        return { agent: active ?? agent, matchedBy: "partial" };
      }
    }
  } catch {
    // Continue
  }

  // Strategy 3: if MAC available but no hostname matched,
  // try by IP (could have multiple matches) and verify each by MAC
  if (hasMac && ipAddress) {
    try {
      const res = await wazuhFetch<WazuhResponse<WazuhAgent>>(
        `/agents?ip=${encodeURIComponent(ipAddress)}&select=${AGENT_SELECT}&limit=10`,
      );
      for (const agent of res.data.affected_items) {
        if (await verifyByMac(agent.id, macAddress!)) {
          return { agent, matchedBy: "mac+hostname" };
        }
      }
    } catch {
      // No match
    }
  }

  return null;
}

/**
 * Test the Wazuh API connection.
 */
export async function testWazuhConnection(): Promise<{
  ok: boolean;
  agentCount?: number;
  error?: string;
}> {
  try {
    const res = await wazuhFetch<WazuhResponse<WazuhAgent>>(
      "/agents?limit=1&select=id",
    );
    return { ok: true, agentCount: res.data.total_affected_items };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
