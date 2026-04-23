// ============================================================================
// Stockage fichiers installeurs Logiciels — filesystem local.
// Racine : env NEXUS_SOFTWARE_STORAGE ou ./storage/software
// Layout : <templateId | "org-<orgId>-<instanceId>"> / <cuid>.<ext>
// ============================================================================

import { promises as fs } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const ROOT = process.env.NEXUS_SOFTWARE_STORAGE || path.resolve(process.cwd(), "storage/software");

export async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
}

export function storageRoot() {
  return ROOT;
}

/** Retourne chemin absolu sur disque à partir d'un chemin relatif stocké en DB. */
export function resolveStoragePath(relPath: string) {
  const abs = path.resolve(ROOT, relPath);
  if (!abs.startsWith(ROOT)) throw new Error("Path traversal refusé");
  return abs;
}

export async function saveUploadedBuffer(
  buffer: Buffer,
  opts: { scope: "GLOBAL" | "ORG"; templateId?: string; instanceId?: string; organizationId?: string; filename: string },
): Promise<{ storagePath: string; sha256: string; sizeBytes: number }> {
  await ensureRoot();
  const sub =
    opts.scope === "GLOBAL"
      ? (opts.templateId ?? "misc")
      : `org-${opts.organizationId ?? "unknown"}-${opts.instanceId ?? "unknown"}`;
  const dir = path.resolve(ROOT, sub);
  if (!dir.startsWith(ROOT)) throw new Error("Path traversal");
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(opts.filename).slice(0, 10) || "";
  const id = randomBytes(12).toString("base64url");
  const rel = path.join(sub, `${id}${ext}`);
  const abs = path.resolve(ROOT, rel);
  await fs.writeFile(abs, buffer);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  return { storagePath: rel, sha256, sizeBytes: buffer.byteLength };
}

export async function readFromStorage(relPath: string): Promise<{ stream: fs.FileHandle; size: number }> {
  const abs = resolveStoragePath(relPath);
  const stat = await fs.stat(abs);
  const handle = await fs.open(abs, "r");
  return { stream: handle, size: stat.size };
}
