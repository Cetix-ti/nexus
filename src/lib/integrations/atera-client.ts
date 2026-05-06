// ============================================================================
// ATERA RMM API CLIENT
// Real implementation that hits the Atera REST API
// ============================================================================

// Read at call time (not module init) so scripts that load .env via dotenv
// AFTER importing this module still see the values.
const getBaseUrl = () =>
  process.env.ATERA_API_BASE || "https://app.atera.com/api/v3";
const getApiKey = () => process.env.ATERA_API_KEY;

export interface AteraCustomer {
  CustomerID: number;
  CustomerName: string;
  BusinessNumber?: string | null;
  Domain?: string | null;
  Address?: string | null;
  City?: string | null;
  State?: string | null;
  Country?: string | null;
  Phone?: string | null;
  Notes?: string | null;
  Links?: { Rel: string; Href: string }[];
}

export interface AteraAgent {
  AgentID: number;
  DeviceGuid?: string;
  MachineName: string;
  AgentName?: string;
  CustomerID: number;
  CustomerName?: string;
  SystemSerialNumber?: string;
  Domain?: string;
  Vendor?: string;
  VendorBrandModel?: string;
  Processor?: string;
  Memory?: string;
  IpAddresses?: string[];
  MacAddresses?: string[];
  WindowsSerialNumber?: string;
  OSType?: string;
  OSBuild?: string;
  AppViewUrl?: string;
  Online?: boolean;
  LastLoginUser?: string;
  HardwareInformation?: any;
  // Date fields (présence variable selon le type d'agent et la version de l'API)
  Created?: string;
  Modified?: string;
  LastSeen?: string;
  LastRebootTime?: string;
  ReportedFromIP?: string;
}

interface AteraResponse<T> {
  items: T[];
  totalItemCount: number;
  page: number;
  itemsInPage: number;
  totalPages: number;
  prevLink?: string;
  nextLink?: string;
}

async function ateraFetch<T>(
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "ATERA_API_KEY n'est pas configurée. Ajoutez-la dans .env"
    );
  }

  const url = endpoint.startsWith("http") ? endpoint : `${getBaseUrl()}${endpoint}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    // Atera responses are not heavy; cache 60s server-side
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Atera API error ${response.status}: ${text || response.statusText}`
    );
  }

  return (await response.json()) as T;
}

/**
 * List all customers in the Atera tenant.
 * Auto-paginates through all pages.
 */
export async function listAteraCustomers(): Promise<AteraCustomer[]> {
  const all: AteraCustomer[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await ateraFetch<AteraResponse<AteraCustomer>>(
      `/customers?page=${page}&itemsInPage=50`
    );
    all.push(...res.items);
    totalPages = res.totalPages;
    page++;
  } while (page <= totalPages && page <= 20); // safety: max 20 pages
  return all;
}

/**
 * Get a single customer by ID.
 */
export async function getAteraCustomer(id: number): Promise<AteraCustomer> {
  const res = await ateraFetch<AteraResponse<AteraCustomer>>(`/customers/${id}`);
  return res.items[0];
}

/**
 * List all agents (devices) for a specific Atera customer.
 */
export async function listAteraAgentsForCustomer(
  customerId: number
): Promise<AteraAgent[]> {
  const all: AteraAgent[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await ateraFetch<AteraResponse<AteraAgent>>(
      `/agents/customer/${customerId}?page=${page}&itemsInPage=50`
    );
    all.push(...res.items);
    totalPages = res.totalPages;
    page++;
  } while (page <= totalPages && page <= 20);
  return all;
}

/**
 * Cache module-level pour `listAllAteraAgents`. Permet à un workflow comme
 * "analyse → purge" (qui appelle 2× la liste complète à ~30s la fetch) de
 * ne payer le coût qu'une fois quand les deux étapes s'enchaînent.
 *
 * Invalidation :
 *   - TTL 60s
 *   - `fresh: true` force le bypass
 */
const agentsCache: { data: AteraAgent[] | null; fetchedAt: number } = {
  data: null,
  fetchedAt: 0,
};
const AGENTS_CACHE_TTL_MS = 60_000;

/**
 * List ALL agents in the Atera tenant (across all customers).
 * Auto-paginates. Used by maintenance scripts (purge inactifs, audit, etc.).
 *
 * Cache module-level 60s — voir `agentsCache` ci-dessus.
 */
export async function listAllAteraAgents(opts?: {
  itemsInPage?: number;
  maxPages?: number;
  fresh?: boolean;
  onPage?: (page: number, totalPages: number) => void;
}): Promise<AteraAgent[]> {
  if (
    !opts?.fresh &&
    agentsCache.data &&
    Date.now() - agentsCache.fetchedAt < AGENTS_CACHE_TTL_MS
  ) {
    return agentsCache.data;
  }

  const itemsInPage = opts?.itemsInPage ?? 50;
  const maxPages = opts?.maxPages ?? 1000;
  const all: AteraAgent[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await ateraFetch<AteraResponse<AteraAgent>>(
      `/agents?page=${page}&itemsInPage=${itemsInPage}`
    );
    all.push(...res.items);
    totalPages = res.totalPages;
    opts?.onPage?.(page, totalPages);
    page++;
  } while (page <= totalPages && page <= maxPages);

  agentsCache.data = all;
  agentsCache.fetchedAt = Date.now();
  return all;
}

/**
 * Invalide le cache des agents. À appeler après une purge pour que le
 * prochain `listAllAteraAgents` retourne la liste fraîche (sans les agents
 * qu'on vient de supprimer).
 */
export function invalidateAteraAgentsCache(): void {
  agentsCache.data = null;
  agentsCache.fetchedAt = 0;
}

/**
 * Delete an Atera agent by AgentID.
 * Irréversible : l'agent est retiré du tenant Atera et l'historique est perdu.
 */
export async function deleteAteraAgent(agentId: number): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("ATERA_API_KEY n'est pas configurée. Ajoutez-la dans .env");
  }
  const url = `${getBaseUrl()}/agents/${agentId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Atera DELETE /agents/${agentId} → ${response.status}: ${
        text || response.statusText
      }`
    );
  }
}

/**
 * Test the API connection — returns true if the key works.
 */
export async function testAteraConnection(): Promise<{
  ok: boolean;
  customerCount?: number;
  error?: string;
}> {
  try {
    const res = await ateraFetch<AteraResponse<AteraCustomer>>(
      "/customers?page=1&itemsInPage=1"
    );
    return { ok: true, customerCount: res.totalItemCount };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface AteraAvailablePatch {
  name: string;
  class: string;
  kbId?: string;
  status: string;
}

interface AteraAvailablePatchesResponse {
  deviceGuid: string;
  timestamp: string;
  availableUpdates: AteraAvailablePatch[];
}

/**
 * List available patches / updates for a specific Atera agent.
 * Uses the deviceGuid (not agentId).
 */
export async function listAteraAvailablePatches(
  deviceGuid: string
): Promise<AteraAvailablePatch[]> {
  const res = await ateraFetch<AteraAvailablePatchesResponse>(
    `/agents/${deviceGuid}/available-patches`
  );
  return res.availableUpdates ?? [];
}

/**
 * Map an Atera Agent to our internal OrgAsset shape.
 * Used by the asset sync logic.
 */
export function mapAteraAgentToOrgAsset(
  agent: AteraAgent,
  organizationId: string
) {
  // Determine asset type from OS / vendor / machine name heuristics
  let type: string = "workstation";
  const os = (agent.OSType || "").toLowerCase();
  const model = (agent.VendorBrandModel || "").toLowerCase();
  const machineName = (agent.MachineName || "").toLowerCase();

  // Common server machine name prefixes / keywords (MSP convention).
  // Atera's OSType is a role label ("Work Station", "Domain Controller",
  // "Server", "Hyper-V"...) not a real OS string, so name-based heuristics
  // are often the only reliable signal for virtual servers.
  const serverNamePatterns = [
    /^srv[-_0-9]/i,          // SRV-XXX, SRV1
    /[-_]srv[-_0-9]?/i,      // XXX-SRV
    /^ser[-_0-9]/i,          // SER-XXX, SERDC1, SERVEUR-001
    /^serveur/i,             // SERVEUR-XXX (FR convention)
    /^dc[-_0-9]/i,           // DC-01, DC1
    /dc[0-9]+$/i,            // SERDC1, SERDC2
    /^sql[-_0-9]/i,          // SQL-XXX
    /^web[-_0-9]/i,          // WEB-XXX
    /^fs[-_0-9]/i,           // FS-01 (File Server)
    /^app[-_0-9]/i,          // APP-XXX
    /^db[-_0-9]/i,           // DB-XXX
    /^mail[-_0-9]/i,         // MAIL-XXX
    /^exch[-_0-9]?/i,        // EXCH-01 (Exchange)
    /^print[-_0-9]?/i,       // PRINT-XXX
    /^backup[-_0-9]?/i,      // BACKUP-XXX
    /^vm[-_0-9]/i,           // VM-XXX (generic VM)
    /^hv[-_0-9]/i,           // HV-01 (Hyper-V host)
    /^hyperv/i,              // HYPERV-XXX
    /^esxi?[-_0-9]?/i,       // ESX-01, ESXI-01
    /^ad[-_0-9]/i,           // AD-01 (Active Directory)
    /^nas[-_0-9]?/i,         // NAS-01
    /^rds[-_0-9]?/i,         // RDS-01 (Remote Desktop)
    /^ts[-_0-9]/i,           // TS-01 (Terminal Server)
    /server/i,               // literal "server" in the name
  ];
  const looksLikeServer = serverNamePatterns.some((re) => re.test(machineName));

  // Role-based server detection. Atera OSType values like
  // "Domain Controller", "Server", or "Hyper-V" clearly denote a server.
  const osLooksLikeServer =
    os.includes("server") ||
    os.includes("domain controller") ||
    os.includes("domain_controller") ||
    os === "dc";

  // Hypervisor / ESXi / vSphere
  if (os.includes("vmware") || os.includes("esxi") || os.includes("hyper-v")) {
    type = "hypervisor";
  }
  // Linux server (any Linux is treated as server in MSP context)
  else if (
    os.includes("linux") ||
    os.includes("ubuntu") ||
    os.includes("debian") ||
    os.includes("centos") ||
    os.includes("redhat") ||
    os.includes("rhel") ||
    os.includes("suse") ||
    os.includes("fedora")
  ) {
    type = "linux_server";
  }
  // Windows Server — OS role label says so, OR the machine name is clearly
  // a server name (handles virtual Windows servers reporting as "Work Station").
  else if (osLooksLikeServer || looksLikeServer) {
    type = "windows_server";
  }
  // Laptop — detect via model keywords
  else if (
    model.includes("laptop") ||
    model.includes("notebook") ||
    model.includes("thinkpad") ||
    model.includes("elitebook") ||
    model.includes("probook") ||
    model.includes("latitude") ||
    model.includes("xps") && !model.includes("desktop") ||
    /[-_]lap[-_0-9]/i.test(machineName) ||
    /^lap[-_]/i.test(machineName) ||
    /^laptop/i.test(machineName) ||
    /[-_]l$/i.test(machineName)            // Trailing -L suffix (MSP laptop convention)
  ) {
    type = "laptop";
  }
  // Otherwise default to workstation (Windows desktop)

  return {
    id: `atera_${agent.AgentID}`,
    organizationId,
    name: agent.MachineName || agent.AgentName || `Agent-${agent.AgentID}`,
    type,
    status: agent.Online ? "active" : "inactive",
    source: "atera" as const,
    externalId: String(agent.AgentID),
    deviceGuid: agent.DeviceGuid || undefined,
    manufacturer: agent.Vendor || undefined,
    model: agent.VendorBrandModel || undefined,
    serialNumber: agent.SystemSerialNumber || agent.WindowsSerialNumber || undefined,
    os: agent.OSType || undefined,
    osVersion: agent.OSBuild || undefined,
    cpuModel: agent.Processor || undefined,
    ramGb: agent.Memory ? Math.round(parseFloat(agent.Memory) / 1024) : undefined,
    ipAddress: Array.isArray(agent.IpAddresses) ? agent.IpAddresses[0] : undefined,
    macAddress: Array.isArray(agent.MacAddresses) ? agent.MacAddresses[0]?.toUpperCase() : undefined,
    lastLoggedUser: agent.LastLoginUser || undefined,
    fqdn: agent.Domain
      ? `${agent.MachineName}.${agent.Domain}`
      : undefined,
    isMonitored: true,
    lastSeenAt: new Date().toISOString(),
    tags: ["atera-sync"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
  };
}
