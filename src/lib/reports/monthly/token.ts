// ============================================================================
// TOKEN — Jeton signé court (HMAC-SHA256) pour autoriser Puppeteer à
// charger la page de rendu interne sans session utilisateur.
//
// Flow : le service PDF génère un token avec (reportId, exp) signé avec
// un secret serveur (NEXUS_REPORT_TOKEN_SECRET ou AUTH_SECRET), ouvre
// http://localhost:PORT/internal/reports/monthly/{id}?token=XXX, la page
// de rendu vérifie le token et charge le payload depuis la DB.
//
// TTL court (5 min) + single-purpose (reportId scopé) = surface d'attaque
// minimale. Si le token fuite, il expire vite et ne donne accès qu'à un
// seul rapport.
// ============================================================================

import crypto from "node:crypto";

const DEFAULT_TTL_SEC = 300; // 5 minutes

function getSecret(): string {
  // Secret dédié obligatoire : empêche qu'un token de rapport signé soit
  // confondu avec un JWT de session (qui utiliserait AUTH_SECRET).
  const s = process.env.NEXUS_REPORT_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "NEXUS_REPORT_TOKEN_SECRET manquant ou trop court (>= 32 caractères requis). " +
      "Générez-le avec : openssl rand -hex 32",
    );
  }
  return s;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signReportToken(reportId: string, ttlSec = DEFAULT_TTL_SEC): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = Buffer.from(JSON.stringify({ reportId, exp }), "utf8");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest();
  return `${base64UrlEncode(payload)}.${base64UrlEncode(sig)}`;
}

export interface VerifiedToken {
  reportId: string;
  exp: number;
}

export function verifyReportToken(token: string): VerifiedToken | null {
  try {
    const [payloadPart, sigPart] = token.split(".");
    if (!payloadPart || !sigPart) return null;
    const payloadBuf = base64UrlDecode(payloadPart);
    const sigBuf = base64UrlDecode(sigPart);
    const expected = crypto
      .createHmac("sha256", getSecret())
      .update(payloadBuf)
      .digest();
    if (sigBuf.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expected)) return null;
    const parsed = JSON.parse(payloadBuf.toString("utf8")) as VerifiedToken;
    if (typeof parsed.reportId !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}
