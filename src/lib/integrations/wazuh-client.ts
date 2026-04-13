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
 * Find a Wazuh agent matching an asset using multiple strategies:
 *  1. IP address (most reliable)
 *  2. Exact hostname
 *  3. Partial hostname search (handles client-prefix naming, e.g. "HVAC-SERDC1")
 *
 * Returns { agent, matchedBy } or null if no match found.
 */
export async function findWazuhAgent(
  hostname: string,
  ipAddress?: string | null,
): Promise<{ agent: WazuhAgent; matchedBy: "ip" | "hostname" | "partial" } | null> {
  // Strategy 1: match by IP address
  if (ipAddress) {
    try {
      const res = await wazuhFetch<WazuhResponse<WazuhAgent>>(
        `/agents?ip=${encodeURIComponent(ipAddress)}&select=${AGENT_SELECT}&limit=1`,
      );
      if (res.data.affected_items.length > 0) {
        return { agent: res.data.affected_items[0], matchedBy: "ip" };
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 2: exact hostname match
  try {
    const res = await wazuhFetch<WazuhResponse<WazuhAgent>>(
      `/agents?name=${encodeURIComponent(hostname)}&select=${AGENT_SELECT}&limit=1`,
    );
    if (res.data.affected_items.length > 0) {
      return { agent: res.data.affected_items[0], matchedBy: "hostname" };
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 3: partial search (handles prefix like "HVAC-SERDC1" for hostname "SERDC1")
  try {
    const res = await wazuhFetch<WazuhResponse<WazuhAgent>>(
      `/agents?search=${encodeURIComponent(hostname)}&select=${AGENT_SELECT}&limit=5`,
    );
    if (res.data.affected_items.length > 0) {
      // Prefer active agents
      const active = res.data.affected_items.find((a) => a.status === "active");
      return { agent: active ?? res.data.affected_items[0], matchedBy: "partial" };
    }
  } catch {
    // No match found
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
