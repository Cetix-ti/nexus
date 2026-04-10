// ============================================================================
// CERTBOT WRAPPER
// Server-side helpers to inspect cert state, run renewals, check the timer.
// Uses the certbot Cloudflare DNS-01 plugin so renewals work even without
// an open port 80.
// ============================================================================

import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { CertificateStatus } from "./types";

const exec = promisify(execFile);

/**
 * Read the certificate file from /etc/letsencrypt/live/<domain>/cert.pem
 * and parse its expiration date via openssl. Falls back gracefully if the
 * file doesn't exist (cert not yet installed).
 */
export async function getCertificateStatus(
  domain: string
): Promise<CertificateStatus> {
  const certPath = `/etc/letsencrypt/live/${domain}/cert.pem`;
  const status: CertificateStatus = {
    isInstalled: false,
    domain,
    autoRenewActive: false,
  };

  // Check cert file exists
  try {
    await fs.stat(certPath);
    status.isInstalled = true;
  } catch {
    // No cert yet — return early
    status.errorMessage =
      "Aucun certificat trouvé. Lancez l'émission initiale.";
    status.autoRenewActive = await isAutoRenewActive();
    return status;
  }

  // Parse cert via openssl
  try {
    const { stdout } = await exec("openssl", [
      "x509",
      "-in",
      certPath,
      "-noout",
      "-issuer",
      "-startdate",
      "-enddate",
      "-serial",
      "-fingerprint",
      "-sha256",
    ]);
    for (const line of stdout.split("\n")) {
      if (line.startsWith("issuer=")) {
        status.issuer = line.replace("issuer=", "").trim();
      } else if (line.startsWith("notBefore=")) {
        status.validFrom = new Date(
          line.replace("notBefore=", "").trim()
        ).toISOString();
      } else if (line.startsWith("notAfter=")) {
        const validTo = new Date(
          line.replace("notAfter=", "").trim()
        );
        status.validTo = validTo.toISOString();
        const ms = validTo.getTime() - Date.now();
        status.daysUntilExpiry = Math.floor(ms / (1000 * 60 * 60 * 24));
      } else if (line.startsWith("serial=")) {
        status.serialNumber = line.replace("serial=", "").trim();
      } else if (line.startsWith("SHA256 Fingerprint=")) {
        status.fingerprint = line.replace("SHA256 Fingerprint=", "").trim();
      }
    }
  } catch (err) {
    status.errorMessage =
      err instanceof Error ? err.message : "openssl indisponible";
  }

  status.autoRenewActive = await isAutoRenewActive();
  status.lastCheckAt = new Date().toISOString();
  return status;
}

/**
 * Detect whether the certbot timer (systemd) or cron entry is active.
 */
export async function isAutoRenewActive(): Promise<boolean> {
  // Try systemd timer first
  try {
    const { stdout } = await exec("systemctl", [
      "is-active",
      "certbot.timer",
    ]);
    if (stdout.trim() === "active") return true;
  } catch {
    // not systemd or not active
  }
  // Check for cron entry
  try {
    const { stdout } = await exec("crontab", ["-l"]);
    if (stdout.includes("certbot")) return true;
  } catch {
    // no crontab
  }
  // Check /etc/cron.d
  try {
    const cronEntries = await fs.readdir("/etc/cron.d");
    for (const entry of cronEntries) {
      if (entry.includes("certbot")) return true;
    }
  } catch {
    // no /etc/cron.d
  }
  return false;
}

/**
 * Run a dry-run renewal — does not actually issue a new cert but tests the
 * full flow including DNS-01 challenge with the Cloudflare plugin.
 */
export async function renewCertificate(opts: {
  domain: string;
  email: string;
  dryRun: boolean;
  cloudflareIniPath?: string;
}): Promise<{
  succeeded: boolean;
  output: string;
  errorMessage?: string;
  durationMs: number;
}> {
  const start = Date.now();
  const args: string[] = [
    "certonly",
    "--dns-cloudflare",
    "--dns-cloudflare-credentials",
    opts.cloudflareIniPath || "/etc/letsencrypt/cloudflare.ini",
    "--dns-cloudflare-propagation-seconds",
    "30",
    "-d",
    opts.domain,
    "--email",
    opts.email,
    "--agree-tos",
    "--non-interactive",
    "--no-eff-email",
  ];
  if (opts.dryRun) args.push("--dry-run");

  try {
    const { stdout, stderr } = await exec("certbot", args, {
      maxBuffer: 1024 * 1024 * 5, // 5 MB
    });
    return {
      succeeded: true,
      output: (stdout + "\n" + stderr).trim(),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string };
    return {
      succeeded: false,
      output: ((e.stdout || "") + "\n" + (e.stderr || "")).trim(),
      errorMessage: e.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Issue the FIRST certificate for a domain. Same as renewCertificate but
 * meant to be called once when the user sets the domain for the first time.
 */
export async function issueCertificate(opts: {
  domain: string;
  email: string;
  cloudflareIniPath?: string;
}) {
  return renewCertificate({ ...opts, dryRun: false });
}

/**
 * Test if certbot is installed and the cloudflare DNS plugin is available.
 */
export async function testCertbotAvailability(): Promise<{
  certbot: boolean;
  cloudflarePlugin: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const { stdout } = await exec("certbot", ["--version"]);
    const version = stdout.trim();
    // Check the dns-cloudflare plugin
    let cloudflarePlugin = false;
    try {
      const { stdout: plugins } = await exec("certbot", ["plugins"]);
      cloudflarePlugin = plugins.includes("dns-cloudflare");
    } catch {
      // ignore
    }
    return { certbot: true, cloudflarePlugin, version };
  } catch (err) {
    return {
      certbot: false,
      cloudflarePlugin: false,
      error: err instanceof Error ? err.message : "certbot non installé",
    };
  }
}
