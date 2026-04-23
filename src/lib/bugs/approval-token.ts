// Token signé pour approbation/rejet one-click via email.
// TTL 48h. Utilise NEXUS_REPORT_TOKEN_SECRET (déjà obligatoire).

import crypto from "node:crypto";

const DEFAULT_TTL_SEC = 48 * 3600;

function getSecret(): string {
  const s = process.env.NEXUS_REPORT_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error("NEXUS_REPORT_TOKEN_SECRET manquant ou trop court (>= 32 caractères requis).");
  }
  return s;
}

function b64urlEnc(b: Buffer) { return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlDec(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signBugApprovalToken(bugId: string, action: "approve" | "reject", ttlSec = DEFAULT_TTL_SEC): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = Buffer.from(JSON.stringify({ kind: "bug-approval", bugId, action, exp }), "utf8");
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest();
  return `${b64urlEnc(payload)}.${b64urlEnc(sig)}`;
}

export function verifyBugApprovalToken(token: string): { bugId: string; action: "approve" | "reject"; exp: number } | null {
  try {
    const [p, s] = token.split(".");
    if (!p || !s) return null;
    const payload = b64urlDec(p);
    const sig = b64urlDec(s);
    const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest();
    if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
    const parsed = JSON.parse(payload.toString("utf8")) as { kind?: string; bugId?: string; action?: string; exp?: number };
    if (parsed.kind !== "bug-approval" || typeof parsed.bugId !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.action !== "approve" && parsed.action !== "reject") return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { bugId: parsed.bugId, action: parsed.action, exp: parsed.exp };
  } catch { return null; }
}
