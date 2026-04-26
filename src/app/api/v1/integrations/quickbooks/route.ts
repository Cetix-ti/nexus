import { NextResponse } from "next/server";
import { getQboConfig, getAuthUrl } from "@/lib/quickbooks/client";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

/** GET — connection status + auth URL. Phase 9D : MSP_ADMIN+ requis. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const config = await getQboConfig();
    const isConnected = !!(config?.accessToken && config.realmId);

    const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
    const hasCredentials = !!(clientId && clientSecret && clientId.length > 5);

    return NextResponse.json({
      isConnected,
      companyName: config?.companyName ?? null,
      connectedAt: config?.connectedAt ?? null,
      sandbox: config?.sandbox ?? false,
      authUrl: (!isConnected && hasCredentials) ? getAuthUrl() : null,
      hasCredentials,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
