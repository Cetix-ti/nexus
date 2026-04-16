// ============================================================================
// CLOUDFLARE API CLIENT
// Real implementation that hits Cloudflare's REST API to manage DNS for cetix.ca
// ============================================================================

import { ROOT_DOMAIN, type CloudflareDnsRecord } from "./types";

const CF_API = "https://api.cloudflare.com/client/v4";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;

interface CfResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  messages: { code: number; message: string }[];
  result: T;
}

async function cfFetch<T>(
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  if (!TOKEN) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN n'est pas configurée dans .env"
    );
  }
  const url = endpoint.startsWith("http") ? endpoint : `${CF_API}${endpoint}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const json = (await response.json()) as CfResponse<T>;
  if (!response.ok || !json.success) {
    const msg = json.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ||
      `HTTP ${response.status}`;
    throw new Error(`Cloudflare API error — ${msg}`);
  }
  return json.result;
}

/**
 * Test the API token — à la fois la validité formelle du token
 * (/user/tokens/verify) ET les permissions (Zone:Read) en essayant
 * de lister les zones. Sans ce deuxième check, un token qui marche
 * seulement pour `tokens/verify` mais pas pour les zones
 * (permissions insuffisantes) affichait trompeusement "valide".
 */
export async function testCloudflareToken(): Promise<{
  ok: boolean;
  error?: string;
  hasZoneAccess?: boolean;
}> {
  // 1. Token verify (vérifie que le token existe + n'est pas expiré)
  try {
    await cfFetch("/user/tokens/verify");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  // 2. Zone access (vérifie la permission Zone:Read)
  try {
    await cfFetch<unknown>(`/zones?per_page=1`);
    return { ok: true, hasZoneAccess: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distingue erreur de permissions vs erreur réseau.
    return {
      ok: false,
      hasZoneAccess: false,
      error: msg.includes("1000")
        ? "Token valide, mais il n'a pas la permission Zone:Read. Ajoute Zone:Read (et DNS:Edit) sur la zone cetix.ca dans le dashboard Cloudflare → My Profile → API Tokens."
        : msg,
    };
  }
}

interface CfZone {
  id: string;
  name: string;
  status: string;
}

/**
 * Get the zone ID for cetix.ca
 */
export async function getZoneId(): Promise<string> {
  const zones = await cfFetch<CfZone[]>(
    `/zones?name=${encodeURIComponent(ROOT_DOMAIN)}`
  );
  if (!zones || zones.length === 0) {
    throw new Error(`Zone "${ROOT_DOMAIN}" introuvable dans Cloudflare`);
  }
  return zones[0].id;
}

/**
 * List DNS records matching a name (e.g. "nexus.cetix.ca").
 */
export async function listDnsRecords(
  zoneId: string,
  name: string
): Promise<CloudflareDnsRecord[]> {
  const records = await cfFetch<CloudflareDnsRecord[]>(
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}`
  );
  return records;
}

/**
 * Create or update a DNS A record pointing to the given IPv4.
 * If a record exists with the same name, it will be updated.
 */
export async function upsertDnsRecord(params: {
  zoneId: string;
  name: string;
  content: string;
  type?: "A" | "CNAME";
  proxied?: boolean;
  ttl?: number;
}): Promise<CloudflareDnsRecord> {
  const {
    zoneId,
    name,
    content,
    type = "A",
    proxied = true,
    ttl = 1,
  } = params;
  const existing = await listDnsRecords(zoneId, name);

  if (existing.length > 0) {
    const recordId = existing[0].id;
    return cfFetch<CloudflareDnsRecord>(
      `/zones/${zoneId}/dns_records/${recordId}`,
      {
        method: "PUT",
        body: JSON.stringify({ type, name, content, ttl, proxied }),
      }
    );
  }

  return cfFetch<CloudflareDnsRecord>(
    `/zones/${zoneId}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({ type, name, content, ttl, proxied }),
    }
  );
}

/**
 * Delete a DNS record by id.
 */
export async function deleteDnsRecord(
  zoneId: string,
  recordId: string
): Promise<void> {
  await cfFetch<{ id: string }>(
    `/zones/${zoneId}/dns_records/${recordId}`,
    { method: "DELETE" }
  );
}

/**
 * Get this server's public IPv4 address (used as the A record content).
 * Tries Cloudflare's trace endpoint first, falls back to ipify.
 */
export async function getServerPublicIp(): Promise<string> {
  try {
    const res = await fetch("https://1.1.1.1/cdn-cgi/trace", {
      cache: "no-store",
    });
    const text = await res.text();
    const ip = text
      .split("\n")
      .find((l) => l.startsWith("ip="))
      ?.split("=")[1]
      ?.trim();
    if (ip) return ip;
  } catch {
    // ignore, try fallback
  }
  const res = await fetch("https://api.ipify.org?format=json", {
    cache: "no-store",
  });
  const json = (await res.json()) as { ip: string };
  return json.ip;
}
