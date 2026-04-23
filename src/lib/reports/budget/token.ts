// Token signé court pour autoriser Puppeteer à rendre la page budget interne
// sans session. Même pattern que dossier/token.ts.

import crypto from "node:crypto";

const DEFAULT_TTL_SEC = 600; // 10 min (render budget + lignes potentielles lourd)

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

export function signBudgetToken(budgetId: string, ttlSec = DEFAULT_TTL_SEC): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = Buffer.from(JSON.stringify({ kind: "budget", budgetId, exp }), "utf8");
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest();
  return `${b64urlEnc(payload)}.${b64urlEnc(sig)}`;
}

export function verifyBudgetToken(token: string): { budgetId: string; exp: number } | null {
  try {
    const [p, s] = token.split(".");
    if (!p || !s) return null;
    const payload = b64urlDec(p);
    const sig = b64urlDec(s);
    const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest();
    if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
    const parsed = JSON.parse(payload.toString("utf8")) as { kind?: string; budgetId?: string; exp?: number };
    if (parsed.kind !== "budget" || typeof parsed.budgetId !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { budgetId: parsed.budgetId, exp: parsed.exp };
  } catch { return null; }
}
