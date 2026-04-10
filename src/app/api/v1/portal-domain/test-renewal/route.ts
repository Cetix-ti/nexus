import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getDomainConfig,
  logRenewalAttempt,
  getRecentRenewals,
} from "@/lib/portal-domain/storage";
import { ROOT_DOMAIN } from "@/lib/portal-domain/types";
import { renewCertificate } from "@/lib/portal-domain/certbot";

/**
 * POST /api/v1/portal-domain/test-renewal
 * Body: { dryRun?: boolean }  (default: true)
 *
 * Triggers a certbot renewal. By default this is a dry-run which goes through
 * the entire flow including the DNS-01 challenge with Cloudflare but does NOT
 * actually issue a new certificate.
 */
export async function POST(request: NextRequest) {
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

  let body: { dryRun?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const dryRun = body.dryRun !== false;

  const config = await getDomainConfig();
  const fullDomain = `${config.subdomain}.${ROOT_DOMAIN}`;
  const email = config.acmeEmail || "admin@cetix.ca";

  const result = await renewCertificate({
    domain: fullDomain,
    email,
    dryRun,
  });

  await logRenewalAttempt({
    id: `ren_${Date.now()}`,
    attemptedAt: new Date().toISOString(),
    succeeded: result.succeeded,
    durationMs: result.durationMs,
    output: result.output.slice(0, 8000),
    errorMessage: result.errorMessage,
    isDryRun: dryRun,
  });

  return NextResponse.json({
    success: result.succeeded,
    data: {
      domain: fullDomain,
      dryRun,
      durationMs: result.durationMs,
      output: result.output,
      error: result.errorMessage,
    },
  });
}

/**
 * GET /api/v1/portal-domain/test-renewal
 * Returns the recent renewal history.
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

  const renewals = await getRecentRenewals(10);
  return NextResponse.json({ success: true, data: renewals });
}
