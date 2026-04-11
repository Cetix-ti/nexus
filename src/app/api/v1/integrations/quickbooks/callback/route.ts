import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/quickbooks/client";

/** GET — OAuth2 callback from QuickBooks */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const realmId = searchParams.get("realmId");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL("/settings?section=integrations&qbo=error", req.url));
    }

    if (!code || !realmId) {
      return NextResponse.redirect(new URL("/settings?section=integrations&qbo=missing", req.url));
    }

    await exchangeCode(code, realmId);

    return NextResponse.redirect(new URL("/settings?section=integrations&qbo=success", req.url));
  } catch (err) {
    console.error("QBO callback error:", err);
    return NextResponse.redirect(new URL("/settings?section=integrations&qbo=error", req.url));
  }
}
