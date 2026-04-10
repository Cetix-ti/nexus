import type { NextAuthConfig } from "next-auth";

// Edge-compatible auth config (no Prisma, no Node.js-only modules)
// Used by middleware for route protection
export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [], // Providers added in full auth.ts
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Public routes
      if (
        pathname === "/" ||
        pathname === "/login" ||
        pathname === "/portal/login" ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/_next") ||
        pathname.includes(".")
      ) {
        return true;
      }

      // Protected /app routes
      if (pathname.startsWith("/app")) {
        return isLoggedIn;
      }

      // Protected dashboard/tickets routes (legacy paths)
      if (pathname.startsWith("/dashboard") || pathname.startsWith("/tickets")) {
        return isLoggedIn;
      }

      // Portal routes (separate auth context for client users)
      if (pathname.startsWith("/portal")) {
        return isLoggedIn;
      }

      // API routes (non-auth)
      if (pathname.startsWith("/api/v1") || pathname.startsWith("/api/")) {
        if (!pathname.startsWith("/api/auth")) {
          return isLoggedIn;
        }
      }

      return true;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
