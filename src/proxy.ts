import { NextResponse, type NextRequest } from "next/server";

// Public routes that don't require auth
const PUBLIC_PATHS = [
  "/login",
  "/portal/login",
  "/api/auth",
  "/_next",
  "/favicon",
  "/images",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Root → dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Check for NextAuth session cookie (v5 uses authjs.session-token)
  const sessionCookie =
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token");

  if (!sessionCookie) {
    // API requests must receive a JSON 401, not an HTML redirect — otherwise
    // SPA fetches silently follow the 302 to the login page and parse HTML.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    // Portal routes redirect to /portal/login, app routes to /login
    const isPortalRoute = pathname.startsWith("/portal");
    const loginPath = isPortalRoute ? "/portal/login" : "/login";
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
