// ============================================================================
// ATERA RMM API CLIENT
// Real implementation that hits the Atera REST API
// ============================================================================

const BASE_URL = process.env.ATERA_API_BASE || "https://app.atera.com/api/v3";
const API_KEY = process.env.ATERA_API_KEY;

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
  WindowsSerialNumber?: string;
  OSType?: string;
  OSBuild?: string;
  AppViewUrl?: string;
  Online?: boolean;
  LastLoginUser?: string;
  HardwareInformation?: any;
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
  if (!API_KEY) {
    throw new Error(
      "ATERA_API_KEY n'est pas configurée. Ajoutez-la dans .env"
    );
  }

  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "X-API-KEY": API_KEY,
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
  // Determine asset type from OS / vendor
  let type: string = "workstation";
  const os = (agent.OSType || "").toLowerCase();
  if (os.includes("server")) {
    type = "windows_server";
  } else if (os.includes("linux") || os.includes("ubuntu")) {
    type = "linux_server";
  } else if (os.includes("vmware") || os.includes("esxi")) {
    type = "hypervisor";
  } else if (
    (agent.VendorBrandModel || "").toLowerCase().includes("laptop") ||
    (agent.MachineName || "").toLowerCase().includes("lap")
  ) {
    type = "laptop";
  }

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
