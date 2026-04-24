// ============================================================================
// STORAGE — Persistance disque des PDFs de rapports mensuels.
//
// Architecture : filesystem local, chemin relatif stocké en DB (filePath).
// Racine configurable via NEXUS_REPORTS_DIR, défaut /var/nexus/reports/monthly.
// Laisser le chemin relatif permet une migration future vers S3/MinIO sans
// toucher aux anciens records — il suffit de changer la fonction de résolution.
//
// Structure : {orgSlug}/{YYYY-MM}/{reportId}.pdf
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.env.NEXUS_REPORTS_DIR ?? "/var/nexus/reports/monthly";

export interface StoredFileMeta {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

function absoluteOf(relativePath: string): string {
  // Défense en profondeur : interdit les "../" pour éviter l'écriture hors
  // de ROOT même si quelqu'un passe un chemin manipulé.
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(path.resolve(ROOT) + path.sep) && resolved !== path.resolve(ROOT)) {
    throw new Error(`Invalid report path (escapes root): ${relativePath}`);
  }
  return resolved;
}

function buildRelativePath(
  orgSlug: string,
  period: string,
  reportId: string,
): string {
  const safeSlug = orgSlug.replace(/[^a-z0-9-_]/gi, "_");
  const safePeriod = period.replace(/[^0-9-]/g, "");
  return path.join(safeSlug, safePeriod, `${reportId}.pdf`);
}

export async function writeReportPdf(params: {
  orgSlug: string;
  period: string; // "YYYY-MM"
  reportId: string;
  buffer: Buffer;
}): Promise<StoredFileMeta> {
  const relativePath = buildRelativePath(
    params.orgSlug,
    params.period,
    params.reportId,
  );
  const abs = absoluteOf(relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, params.buffer);
  const sha256 = crypto.createHash("sha256").update(params.buffer).digest("hex");
  return {
    relativePath,
    sizeBytes: params.buffer.length,
    sha256,
  };
}

export async function readReportPdf(relativePath: string): Promise<Buffer> {
  const abs = absoluteOf(relativePath);
  return fs.readFile(abs);
}

export async function reportPdfExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(absoluteOf(relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function deleteReportPdf(relativePath: string): Promise<void> {
  try {
    await fs.unlink(absoluteOf(relativePath));
  } catch {
    // Silencieux : si le fichier n'existe plus, c'est OK.
  }
}

export function getStorageRoot(): string {
  return ROOT;
}
