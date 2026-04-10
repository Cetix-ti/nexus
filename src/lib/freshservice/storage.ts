// ============================================================================
// FRESHSERVICE IMPORT — Storage layer
// Persists imported data + backups in /opt/nexus/data/freshservice/
// ============================================================================

import { promises as fs } from "fs";
import path from "path";
import type { MappingResult } from "./mapper";

const DATA_DIR = path.join(process.cwd(), "data", "freshservice");
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");
const SNAPSHOT_FILE = path.join(DATA_DIR, "imported.json");
const HISTORY_FILE = path.join(DATA_DIR, "import-history.json");

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

export interface ImportRecord {
  id: string;
  timestamp: string;
  startedBy: string;
  fileName: string;
  fileSizeBytes: number;
  strategy: "overwrite" | "merge";
  durationMs: number;
  succeeded: boolean;
  errorMessage?: string;
  // Stats
  organizations: number;
  contacts: number;
  agents: number;
  queues: number;
  tickets: number;
  ticketComments: number;
  assets: number;
  kbArticles: number;
  warnings: number;
  backupFile?: string;
}

/**
 * Save the latest snapshot of imported data so the rest of the app
 * can read from it (Phase 1 — file-based, will move to DB later).
 */
export async function saveImportSnapshot(
  result: MappingResult
): Promise<void> {
  await ensureDirs();
  // Strip the index maps before persisting (heavy & rebuildable)
  const persisted = {
    organizations: result.organizations,
    contacts: result.contacts,
    agents: result.agents,
    queues: result.queues,
    tickets: result.tickets,
    assets: result.assets,
    kbArticles: result.kbArticles,
    warnings: result.warnings,
    snapshotAt: new Date().toISOString(),
  };
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(persisted), "utf-8");
}

export async function loadImportSnapshot(): Promise<MappingResult | null> {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf-8");
    const data = JSON.parse(raw) as MappingResult & { snapshotAt: string };
    return {
      ...data,
      orgIdByName: {},
      contactIdByFsId: {},
      agentIdByFsId: {},
      queueIdByFsId: {},
    };
  } catch {
    return null;
  }
}

/**
 * Create a backup of the current snapshot before doing a destructive import.
 * Returns the backup file name.
 */
export async function backupCurrentSnapshot(): Promise<string | null> {
  try {
    await ensureDirs();
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf-8");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(BACKUP_DIR, `freshservice-snapshot-${stamp}.json`);
    await fs.writeFile(file, raw, "utf-8");
    return file;
  } catch {
    return null; // nothing to back up
  }
}

export async function listBackups(): Promise<string[]> {
  try {
    await ensureDirs();
    const files = await fs.readdir(BACKUP_DIR);
    return files
      .filter((f) => f.startsWith("freshservice-snapshot-"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------------------
// IMPORT HISTORY
// ----------------------------------------------------------------------------
export async function logImport(record: ImportRecord): Promise<void> {
  await ensureDirs();
  let history: ImportRecord[] = [];
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf-8");
    history = JSON.parse(raw) as ImportRecord[];
  } catch {
    history = [];
  }
  history.push(record);
  if (history.length > 100) history = history.slice(-100);
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
}

export async function getImportHistory(): Promise<ImportRecord[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf-8");
    const history = JSON.parse(raw) as ImportRecord[];
    return history.reverse();
  } catch {
    return [];
  }
}
