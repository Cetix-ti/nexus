// ============================================================================
// PORTAL DOMAIN — File-based persistence
// Stores config in /opt/nexus/data/portal-domain.json (create the dir first)
// In production this would live in PostgreSQL.
// ============================================================================

import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_DOMAIN_CONFIG,
  type PortalDomainConfig,
  type RenewalAttempt,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "portal-domain.json");
const RENEWALS_FILE = path.join(DATA_DIR, "portal-renewals.json");

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

export async function getDomainConfig(): Promise<PortalDomainConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as PortalDomainConfig;
  } catch {
    return { ...DEFAULT_DOMAIN_CONFIG };
  }
}

export async function saveDomainConfig(
  patch: Partial<PortalDomainConfig>,
  updatedBy?: string
): Promise<PortalDomainConfig> {
  await ensureDataDir();
  const current = await getDomainConfig();
  const next: PortalDomainConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? current.updatedBy,
  };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

// ----------------------------------------------------------------------------
// RENEWAL HISTORY
// ----------------------------------------------------------------------------
export async function getRecentRenewals(limit = 10): Promise<RenewalAttempt[]> {
  try {
    const raw = await fs.readFile(RENEWALS_FILE, "utf-8");
    const all = JSON.parse(raw) as RenewalAttempt[];
    return all.slice(-limit).reverse();
  } catch {
    return [];
  }
}

export async function logRenewalAttempt(
  attempt: RenewalAttempt
): Promise<void> {
  await ensureDataDir();
  let existing: RenewalAttempt[] = [];
  try {
    const raw = await fs.readFile(RENEWALS_FILE, "utf-8");
    existing = JSON.parse(raw) as RenewalAttempt[];
  } catch {
    existing = [];
  }
  existing.push(attempt);
  // Keep only last 50
  if (existing.length > 50) existing = existing.slice(-50);
  await fs.writeFile(RENEWALS_FILE, JSON.stringify(existing, null, 2), "utf-8");
}
