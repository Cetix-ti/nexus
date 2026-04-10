// ============================================================================
// PORTAL DOMAIN MANAGEMENT
// Allows super-admins to configure the portal subdomain and SSL renewal
// ============================================================================

/** The fixed root domain — clients can only choose the subdomain */
export const ROOT_DOMAIN = "cetix.ca";

export interface PortalDomainConfig {
  /** Subdomain only, e.g. "nexus" — full URL is `${subdomain}.${ROOT_DOMAIN}` */
  subdomain: string;
  /** True when DNS record points to this server */
  dnsConfigured: boolean;
  /** ISO timestamp of last successful DNS sync to Cloudflare */
  lastDnsSyncAt?: string;
  /** Cloudflare zone ID (cached after first lookup) */
  cloudflareZoneId?: string;
  /** ID of the DNS record we manage */
  cloudflareRecordId?: string;
  /** Force HTTPS (HSTS, redirect) */
  forceHttps: boolean;
  /** Auto-renewal enabled */
  autoRenewEnabled: boolean;
  /** ISO timestamp of last successful renewal */
  lastRenewedAt?: string;
  /** ISO timestamp of next scheduled renewal */
  nextRenewalAt?: string;
  /** Email used for ACME notifications */
  acmeEmail?: string;
  /** Audit */
  updatedAt: string;
  updatedBy?: string;
}

export interface CertificateStatus {
  isInstalled: boolean;
  domain: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
  serialNumber?: string;
  fingerprint?: string;
  // Cron / systemd timer status
  autoRenewActive: boolean;
  lastCheckAt?: string;
  errorMessage?: string;
}

export interface CloudflareDnsRecord {
  id: string;
  type: "A" | "AAAA" | "CNAME";
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
}

export interface RenewalAttempt {
  id: string;
  attemptedAt: string;
  succeeded: boolean;
  durationMs: number;
  output: string;
  errorMessage?: string;
  isDryRun: boolean;
}

export const DEFAULT_DOMAIN_CONFIG: PortalDomainConfig = {
  subdomain: "nexus",
  dnsConfigured: false,
  forceHttps: true,
  autoRenewEnabled: true,
  acmeEmail: "admin@cetix.ca",
  updatedAt: new Date().toISOString(),
};
