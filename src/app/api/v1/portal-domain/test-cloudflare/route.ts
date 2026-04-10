import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  testCloudflareToken,
  getZoneId,
  getServerPublicIp,
  listDnsRecords,
} from "@/lib/portal-domain/cloudflare-client";
import { getDomainConfig } from "@/lib/portal-domain/storage";
import { ROOT_DOMAIN } from "@/lib/portal-domain/types";

/**
 * GET /api/v1/portal-domain/test-cloudflare
 * Tests the Cloudflare API token + resolves the cetix.ca zone + checks DNS.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Authentification requise" },
      { status: 401 }
    );
  }
  const role = (session.user as any).role;
  if (role !== "SUPER_ADMIN" && role !== "MSP_ADMIN") {
    return NextResponse.json(
      { success: false, error: "Accès refusé" },
      { status: 403 }
    );
  }

  const result: Record<string, unknown> = { rootDomain: ROOT_DOMAIN };

  // 1. Test token
  const tokenTest = await testCloudflareToken();
  result.tokenValid = tokenTest.ok;
  if (!tokenTest.ok) {
    result.tokenError = tokenTest.error;
    return NextResponse.json({ success: false, data: result });
  }

  // 2. Get zone
  try {
    const zoneId = await getZoneId();
    result.zoneId = zoneId;
    result.zoneFound = true;

    // 3. Check current DNS for the configured subdomain
    const config = await getDomainConfig();
    const fullDomain = `${config.subdomain}.${ROOT_DOMAIN}`;
    result.fullDomain = fullDomain;
    const records = await listDnsRecords(zoneId, fullDomain);
    result.existingRecords = records;
    result.dnsConfigured = records.length > 0;

    // 4. Public IP of this server
    const ip = await getServerPublicIp();
    result.serverIp = ip;
    if (records.length > 0) {
      result.dnsMatchesServer = records.some(
        (r) => r.content === ip && (r.type === "A" || r.type === "AAAA")
      );
    }
  } catch (err) {
    result.zoneFound = false;
    result.zoneError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, data: result });
  }

  return NextResponse.json({ success: true, data: result });
}
