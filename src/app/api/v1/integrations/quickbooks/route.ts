import { NextResponse } from "next/server";
import { getQboConfig, getAuthUrl } from "@/lib/quickbooks/client";

/** GET — connection status + auth URL */
export async function GET() {
  try {
    const config = await getQboConfig();
    const isConnected = !!(config?.accessToken && config.realmId);

    return NextResponse.json({
      isConnected,
      companyName: config?.companyName ?? null,
      connectedAt: config?.connectedAt ?? null,
      sandbox: config?.sandbox ?? false,
      authUrl: !isConnected ? getAuthUrl() : null,
      hasCredentials: !!(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
