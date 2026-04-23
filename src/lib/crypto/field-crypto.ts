// ============================================================================
// Chiffrement symétrique at-rest pour champs sensibles (licenseKey, secrets
// vendor, etc.) — AES-256-GCM, clé dérivée via HKDF d'un master secret.
//
// Format en DB (string) : `enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`
// Les anciennes valeurs non-chiffrées (legacy) sont détectées par l'absence
// de préfixe `enc:v1:` et lues en clair — permet une migration lazy.
//
// Clé : NEXUS_FIELD_SECRET (>= 32 chars). Pour faciliter la rotation, on
// garde aussi une NEXUS_FIELD_SECRET_PREV optionnelle — décrypte si la v1
// actuelle ne matche pas, puis l'app réécrit la valeur avec la clé courante
// au prochain PATCH.
// ============================================================================

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const KEY_INFO = Buffer.from("nexus-field-v1", "utf8");

function loadMaster(envName: string): Buffer | null {
  const raw = process.env[envName];
  if (!raw || raw.length < 32) return null;
  return Buffer.from(raw, "utf8");
}

function deriveKey(master: Buffer): Buffer {
  // HKDF-SHA256 → 32 bytes (AES-256).
  const okm = hkdfSync("sha256", master, Buffer.alloc(0), KEY_INFO, 32);
  return Buffer.from(okm);
}

function requireMasterKey(): Buffer {
  const master = loadMaster("NEXUS_FIELD_SECRET");
  if (!master) {
    throw new Error(
      "NEXUS_FIELD_SECRET manquant ou < 32 caractères. Générer : openssl rand -hex 32",
    );
  }
  return deriveKey(master);
}

/**
 * Chiffre une valeur string. Retourne le format `enc:v1:...`.
 * Si la valeur est déjà chiffrée (préfixe détecté), retourne telle quelle.
 */
export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  if (plain.startsWith(PREFIX)) return plain;
  const key = requireMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/**
 * Déchiffre une valeur. Si la valeur n'a pas le préfixe (legacy clair),
 * la retourne telle quelle — permet lecture rétrocompatible.
 * Retourne null si le déchiffrement échoue (corruption / mauvaise clé).
 */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy cleartext
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  const [ivB64, tagB64, ctB64] = parts;
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    return tryDecrypt(iv, tag, ct);
  } catch {
    return null;
  }
}

function tryDecrypt(iv: Buffer, tag: Buffer, ct: Buffer): string | null {
  // Essaye master courant puis previous (rotation).
  const masters = [loadMaster("NEXUS_FIELD_SECRET"), loadMaster("NEXUS_FIELD_SECRET_PREV")].filter(
    (m): m is Buffer => m != null,
  );
  for (const m of masters) {
    try {
      const key = deriveKey(m);
      const d = createDecipheriv("aes-256-gcm", key, iv);
      d.setAuthTag(tag);
      const pt = Buffer.concat([d.update(ct), d.final()]);
      return pt.toString("utf8");
    } catch {
      continue;
    }
  }
  return null;
}

/** Retourne true si la valeur stockée est chiffrée (préfixe v1). */
export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

/**
 * Masque pour affichage : laisse les 4 derniers caractères visibles.
 * Utile côté UI pour rappeler qu'une clé est présente sans la montrer.
 */
export function maskSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  if (plain.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, plain.length - 4))}${plain.slice(-4)}`;
}
