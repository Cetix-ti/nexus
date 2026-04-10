import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getDomainConfig,
  saveDomainConfig,
} from "@/lib/portal-domain/storage";
import { ROOT_DOMAIN } from "@/lib/portal-domain/types";
import {
  upsertDnsRecord,
  getZoneId,
  getServerPublicIp,
} from "@/lib/portal-domain/cloudflare-client";

/**
 * Validate a subdomain label according to RFC 1035.
 * Allowed: a–z, 0–9, hyphens (not at start/end), 1–63 chars.
 */
function isValidSubdomain(s: string): boolean {
  if (!s || s.length < 1 || s.length > 63) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s);
}

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Authentification requise", status: 401 };
  }
  const role = (session.user as any).role;
  // SUPER_ADMIN and MSP_ADMIN can manage portal domain
  if (role !== "SUPER_ADMIN" && role !== "MSP_ADMIN") {
    return { ok: false, error: "Accès refusé : super-admin requis", status: 403 };
  }
  return { ok: true, user: session.user };
}

/**
 * GET /api/v1/portal-domain
 * Returns the current portal domain configuration.
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }
  const config = await getDomainConfig();
  return NextResponse.json({
    success: true,
    data: {
      ...config,
      rootDomain: ROOT_DOMAIN,
      fullDomain: `${config.subdomain}.${ROOT_DOMAIN}`,
    },
  });
}

/**
 * PATCH /api/v1/portal-domain
 * Updates the configuration. Validates the subdomain.
 *
 * Body: { subdomain?, forceHttps?, autoRenewEnabled?, acmeEmail?, syncDns? }
 */
export async function PATCH(request: NextRequest) {
  const authRes = await requireSuperAdmin();
  if (!authRes.ok) {
    return NextResponse.json(
      { success: false, error: authRes.error },
      { status: authRes.status }
    );
  }
  const body = await request.json();
  const patch: Record<string, unknown> = {};

  if (typeof body.subdomain === "string") {
    const sub = body.subdomain.toLowerCase().trim();
    if (!isValidSubdomain(sub)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Sous-domaine invalide. Utilisez uniquement des lettres minuscules, chiffres et tirets (1-63 caractères).",
        },
        { status: 400 }
      );
    }
    patch.subdomain = sub;
  }
  if (typeof body.forceHttps === "boolean") patch.forceHttps = body.forceHttps;
  if (typeof body.autoRenewEnabled === "boolean")
    patch.autoRenewEnabled = body.autoRenewEnabled;
  if (typeof body.acmeEmail === "string") patch.acmeEmail = body.acmeEmail;

  const updatedBy =
    `${(authRes.user as any).firstName ?? ""} ${(authRes.user as any).lastName ?? ""}`.trim() ||
    (authRes.user as any).email;
  let saved = await saveDomainConfig(patch, updatedBy);

  // Optionally sync DNS to Cloudflare immediately
  if (body.syncDns === true) {
    try {
      const zoneId = await getZoneId();
      const fullDomain = `${saved.subdomain}.${ROOT_DOMAIN}`;
      const ip = await getServerPublicIp();
      const record = await upsertDnsRecord({
        zoneId,
        name: fullDomain,
        content: ip,
        type: "A",
        proxied: true,
      });
      saved = await saveDomainConfig(
        {
          dnsConfigured: true,
          lastDnsSyncAt: new Date().toISOString(),
          cloudflareZoneId: zoneId,
          cloudflareRecordId: record.id,
        },
        updatedBy
      );
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error:
            err instanceof Error
              ? `Configuration enregistrée mais sync DNS échouée : ${err.message}`
              : "Erreur DNS",
          data: saved,
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      ...saved,
      rootDomain: ROOT_DOMAIN,
      fullDomain: `${saved.subdomain}.${ROOT_DOMAIN}`,
    },
  });
}
