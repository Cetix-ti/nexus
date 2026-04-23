import { NextResponse, type NextRequest } from "next/server";

// Public routes that don't require auth
const PUBLIC_PATHS = [
  "/login",
  "/mfa-verify",
  "/auth-redirect",
  "/portal/login",
  "/reset-password",
  "/api/auth",
  "/api/v1/integrations/quickbooks/callback",
  "/api/v1/users/reset-password/confirm",
  "/api/v1/users/reset-password/request",
  // Bitdefender GravityZone pousse vers /api/v1/integrations/bitdefender/webhook.
  // L'endpoint a sa propre auth (header Authorization contre
  // BITDEFENDER_WEBHOOK_SECRET) — bypass de la session cookie Nexus.
  "/api/v1/integrations/bitdefender/webhook",
  // Pages de rendu PDF atteintes par Puppeteer (agent serveur, pas de
  // cookie de session). Protégées par token signé court (verifyReportToken)
  // côté page — safe à exposer sans session cookie.
  "/internal/reports/monthly/",
  // Dossier client 360° — même pattern que monthly, token signé short-lived.
  "/internal/reports/client-dossier/",
  // Téléchargement public d'installeurs logiciels. Token 32 bytes signé,
  // expiration + quota + PIN optionnel côté route — sûr à exposer sans
  // cookie. Voir src/app/d/[token]/route.ts.
  "/d/",
  "/_next",
  "/favicon",
  "/images",
];

// ---------------------------------------------------------------------------
// Rate limiting — in-memory token bucket par IP, bypass si session présente
//
// Philosophie :
//   - Requêtes AUTHENTIFIÉES (cookie authjs.session-token présent) → bypass
//     complet. Une fiche ticket Nexus lance 15-20 calls IA parallèles
//     (copilot, triage, similaires, KB, conventions client, etc.) et un
//     utilisateur loggé n'est pas un attaquant. Si on veut quand même
//     limiter, le faire par userId avec une fenêtre très généreuse, pas
//     par IP (plusieurs techs derrière le même NAT).
//   - Requêtes ANONYMES (pas de cookie) → plafond agressif 60/min par IP.
//     C'est la surface d'attaque brute force / scraping public.
//   - Auth endpoints (/api/auth, /login) → toujours limités à 30/min,
//     peu importe le cookie (protection password-spray même authentifié).
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { tokens: number; lastRefill: number }>();
const RATE_WINDOW = 60_000; // 1 minute
const MAX_ANONYMOUS_API = 60; // anonymes (pas de session) — strict
const MAX_AUTH_REQUESTS = 30; // /api/auth + /login — brute force

function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.lastRefill > RATE_WINDOW) {
    rateLimitMap.set(key, { tokens: max - 1, lastRefill: now });
    return true;
  }
  if (entry.tokens <= 0) return false;
  entry.tokens--;
  return true;
}

// Inline cleanup: evict stale entries during rate-limit checks (no setInterval needed)
function cleanupIfNeeded() {
  if (rateLimitMap.size < 500) return; // Only clean when map gets large
  const now = Date.now();
  for (const [k, v] of rateLimitMap) {
    if (now - v.lastRefill > RATE_WINDOW * 5) rateLimitMap.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Proxy handler
// ---------------------------------------------------------------------------

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // URL courtes pour les tickets : /TK-1234 ou /INT-1234 sont rewrités
  // côté serveur vers /tickets/TK-1234 (qui contient toute la logique du
  // ticket detail). L'utilisateur garde l'URL courte dans la barre.
  const ticketSlugMatch = pathname.match(/^\/((?:TK|INT)-\d+)\/?$/i);
  if (ticketSlugMatch) {
    const url = request.nextUrl.clone();
    url.pathname = `/tickets/${ticketSlugMatch[1].toUpperCase()}`;
    return NextResponse.rewrite(url);
  }

  // Security headers on every response
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  cleanupIfNeeded();

  // Détection session — on lit le cookie AVANT le rate limit pour décider
  // si la requête est authentifiée. O(1), pas de round-trip DB.
  const authenticatedSession =
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token");

  // Rate limiting on auth endpoints (brute force protection) — JAMAIS bypass,
  // même pour un utilisateur déjà loggé (protection password-spray).
  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/login" ||
    pathname === "/portal/login"
  ) {
    if (!checkRateLimit(`auth:${ip}`, MAX_AUTH_REQUESTS)) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans une minute." },
        { status: 429 },
      );
    }
  }

  // Rate limiting on /api/v1/* — bypass complet si la requête porte une
  // session valide. Une fiche ticket peut générer 20+ calls IA parallèles,
  // on ne veut surtout pas bloquer les techs authentifiés. Les appels
  // anonymes (aucun cookie) sont plafonnés à 60/min par IP pour prévenir
  // le scraping / abuse sur une URL publique.
  if (pathname.startsWith("/api/v1/") && !authenticatedSession) {
    if (!checkRateLimit(`api:${ip}`, MAX_ANONYMOUS_API)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 },
      );
    }
  }

  // Allow public routes
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.includes(".")
  ) {
    return response;
  }

  // Root → dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Check for NextAuth session cookie (v5 uses authjs.session-token)
  const sessionCookie =
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token");

  // MFA enforcement: if user has a session but MFA is pending,
  // block access to everything except /mfa-verify and /api/v1/me/mfa
  if (sessionCookie) {
    const mfaPending = request.cookies.get("nexus-mfa-pending")?.value;
    if (mfaPending === "true" && pathname !== "/mfa-verify" && !pathname.startsWith("/api/v1/me/mfa") && !pathname.startsWith("/api/auth")) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "MFA verification required" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/mfa-verify", request.url));
    }
  }

  if (!sessionCookie) {
    // API requests must receive a JSON 401, not an HTML redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }

    // All unauthenticated routes redirect to unified /login
    const loginPath = "/login";
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
