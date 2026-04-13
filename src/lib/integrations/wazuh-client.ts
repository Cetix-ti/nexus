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
 * Pick the best agent from a list of candidates.
 * Prefers active agents, then most recently seen.
 */
function pickBestAgent(agents: WazuhAgent[]): WazuhAgent {
  const active = agents.filter((a) => a.status === "active");
  if (active.length > 0) {
    return active.sort((a, b) =>
      (b.lastKeepAlive ?? "").localeCompare(a.lastKeepAlive ?? "")
    )[0];
  }
  return agents.sort((a, b) =>
    (b.lastKeepAlive ?? "").localeCompare(a.lastKeepAlive ?? "")
  )[0];
}

/**
 * Generate search terms from a hostname, from most specific to broadest.
 * E.g. "HVAC-CLIMATER-W11" → ["HVAC-CLIMATER-W11", "HVAC-CLIMATER-W", "HVAC-CLIMATER", "CLIMATER"]
 */
function buildSearchTerms(hostname: string): string[] {
  const terms: string[] = [hostname];

  // Progressive shortening: remove last 1, 2, 3 characters
  for (let chop = 1; chop <= 3; chop++) {
    if (hostname.length - chop >= 5) {
      terms.push(hostname.slice(0, -chop));
    }
  }

  // Split on delimiters and use the longest "unique" segment
  const segments = hostname.split(/[-_]/);
  if (segments.length >= 2) {
    // Remove first segment (often a client prefix like "HVAC")
    // and last segment (often a short suffix like "W11")
    const middle = segments.slice(1, -1);
    if (middle.length > 0) {
      terms.push(middle.join("-"));
    }
    // Also try without just the first segment
    terms.push(segments.slice(1).join("-"));
  }

  // Deduplicate while preserving order
  return [...new Set(terms)].filter((t) => t.length >= 4);
}

type MatchMethod = "mac" | "hostname" | "search";

/**
 * Find a Wazuh agent matching an asset.
 *
 * Strategy:
 *  1. Search Wazuh using progressive hostname terms (handles truncation & prefixes)
 *  2. Among candidates, verify by MAC if available (handles duplicate IPs across clients)
 *  3. If no MAC, pick the active (or most recently active) agent
 *  4. If hostname searches fail, try IP-based search as fallback
 */
export async function findWazuhAgent(
  hostname: string,
  ipAddress?: string | null,
  macAddress?: string | null,
): Promise<{ agent: WazuhAgent; matchedBy: MatchMethod } | null> {
  const hasMac = !!macAddress;
  const normalizedMac = macAddress?.toUpperCase();

  // Collect all unique candidates from hostname-based searches
  const candidates = new Map<string, WazuhAgent>();
  const searchTerms = buildSearchTerms(hostname);

  for (const term of searchTerms) {
    try {
      // Try exact name match first for each term
      const exactRes = await wazuhFetch<WazuhResponse<WazuhAgent>>(
        `/agents?name=${encodeURIComponent(term)}&select=${AGENT_SELECT}&limit=5`,
      );
      for (const a of exactRes.data.affected_items) {
        candidates.set(a.id, a);
      }
    } catch {
      // Continue
    }

    try {
      // Then partial search
      const searchRes = await wazuhFetch<WazuhResponse<WazuhAgent>>(
        `/agents?search=${encodeURIComponent(term)}&select=${AGENT_SELECT}&limit=10`,
      );
      for (const a of searchRes.data.affected_items) {
        candidates.set(a.id, a);
      }
    } catch {
      // Continue
    }

    // Stop only if we found an active candidate
    const hasActive = Array.from(candidates.values()).some((a) => a.status === "active");
    if (hasActive) break;
  }

  // Fallback: search by IP if no hostname candidates found
  if (candidates.size === 0 && ipAddress) {
    try {
      const res = await wazuhFetch<WazuhResponse<WazuhAgent>>(
        `/agents?ip=${encodeURIComponent(ipAddress)}&select=${AGENT_SELECT}&limit=10`,
      );
      for (const a of res.data.affected_items) {
        candidates.set(a.id, a);
      }
    } catch {
      // No candidates
    }
  }

  if (candidates.size === 0) return null;

  const allCandidates = Array.from(candidates.values());

  // If MAC is available, verify each candidate and pick the best verified match
  if (hasMac) {
    const verified: WazuhAgent[] = [];
    for (const agent of allCandidates) {
      const macs = await getAgentMacs(agent.id);
      if (macs.includes(normalizedMac!)) {
        verified.push(agent);
      }
    }
    if (verified.length > 0) {
      return { agent: pickBestAgent(verified), matchedBy: "mac" };
    }
  }

  // No MAC or no MAC-verified match — pick best candidate by status/recency
  // Only if we had hostname-based candidates (not just IP, to avoid cross-client false positives)
  if (candidates.size > 0) {
    return { agent: pickBestAgent(allCandidates), matchedBy: hasMac ? "search" : "search" };
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
