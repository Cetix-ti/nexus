import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { getQboConfig, setQboConfig, type QboConfig } from "@/lib/quickbooks/client";

/** GET — current QuickBooks configuration (show raw values so user can edit) */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getQboConfig();

  // Return actual values (not masked) so the form can be pre-filled and edited
  return NextResponse.json({
    clientId: config?.clientId ?? process.env.QUICKBOOKS_CLIENT_ID ?? "",
    clientSecret: config?.clientSecret ?? process.env.QUICKBOOKS_CLIENT_SECRET ?? "",
    redirectUri: config?.redirectUri ?? process.env.QUICKBOOKS_REDIRECT_URI ?? "",
    sandbox: config?.sandbox ?? process.env.QUICKBOOKS_SANDBOX === "true",
    realmId: config?.realmId ?? "",
    accessToken: config?.accessToken ?? "",
    refreshToken: config?.refreshToken ?? "",
    tokenExpiresAt: config?.tokenExpiresAt ?? "",
    connectedAt: config?.connectedAt ?? "",
    companyName: config?.companyName ?? "",
    isConnected: !!(config?.accessToken && config?.realmId),
  });
}

/** PATCH — save QuickBooks configuration */
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    const config: QboConfig = {
      clientId: (body.clientId ?? "").trim(),
      clientSecret: (body.clientSecret ?? "").trim(),
      redirectUri: (body.redirectUri ?? "").trim(),
      sandbox: body.sandbox ?? false,
      realmId: (body.realmId ?? "").trim() || undefined,
      accessToken: (body.accessToken ?? "").trim() || undefined,
      refreshToken: (body.refreshToken ?? "").trim() || undefined,
      tokenExpiresAt: body.tokenExpiresAt || undefined,
      connectedAt: (body.accessToken && body.realmId) ? new Date().toISOString() : undefined,
      companyName: (body.companyName ?? "").trim() || undefined,
    };

    await setQboConfig(config);

    return NextResponse.json({
      success: true,
      isConnected: !!(config.accessToken && config.realmId),
      companyName: config.companyName,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur de sauvegarde" }, { status: 500 });
  }
}

/** DELETE — disconnect QuickBooks (clear tokens) */
export async function DELETE() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const existing = await getQboConfig();
  if (existing) {
    await setQboConfig({
      clientId: existing.clientId,
      clientSecret: existing.clientSecret,
      redirectUri: existing.redirectUri,
      sandbox: existing.sandbox,
      // Clear tokens
      realmId: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      tokenExpiresAt: undefined,
      connectedAt: undefined,
      companyName: undefined,
    });
  }

  return NextResponse.json({ success: true });
}
