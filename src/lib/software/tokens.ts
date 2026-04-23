import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/** Token non-devinable 32 bytes base64url — 256 bits d'entropie. */
export function generateDownloadToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash PIN (SHA-256). PIN court : pas de bcrypt nécessaire — usage à durée limitée. */
export function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

export function verifyPin(pin: string, hash: string): boolean {
  const a = Buffer.from(hashPin(pin), "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** PIN aléatoire lisible : 6 chiffres (10^6 = 1M — suffisant couplé au token). */
export function generatePin(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
