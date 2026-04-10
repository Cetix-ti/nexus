import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDomainConfig } from "@/lib/portal-domain/storage";
import { ROOT_DOMAIN } from "@/lib/portal-domain/types";
import {
  getCertificateStatus,
  testCertbotAvailability,
} from "@/lib/portal-domain/certbot";

/**
 * GET /api/v1/portal-domain/cert-status
 * Returns the current certificate state + certbot availability check.
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

  const config = await getDomainConfig();
  const fullDomain = `${config.subdomain}.${ROOT_DOMAIN}`;

  const [status, availability] = await Promise.all([
    getCertificateStatus(fullDomain),
    testCertbotAvailability(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      certificate: status,
      availability,
      domain: fullDomain,
    },
  });
}
