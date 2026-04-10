import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import prisma from "@/lib/prisma";
import {
  resolveOrgByEmail,
  resolveOrgByAzureTenant,
  type PortalOrg,
} from "@/lib/portal/org-resolver";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    // Portal-specific
    organizationId?: string;
    organizationName?: string;
    organizationSlug?: string;
    portalRole?: "viewer" | "manager" | "admin";
  }

  interface Session {
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      image?: string | null;
      organizationId?: string;
      organizationName?: string;
      organizationSlug?: string;
      portalRole?: "viewer" | "manager" | "admin";
    };
  }
}

// ============================================================================
// DEMO USERS (no DB required) — for credentials sign-in
// ============================================================================
const DEMO_USERS = [
  {
    id: "usr_admin",
    email: "admin@nexus.local",
    password: "admin123",
    firstName: "Jean-Philippe",
    lastName: "Côté",
    role: "MSP_ADMIN",
  },
  {
    id: "usr_tech1",
    email: "marie@nexus.local",
    password: "tech123",
    firstName: "Marie",
    lastName: "Tremblay",
    role: "TECHNICIAN",
  },
  {
    id: "usr_tech2",
    email: "alex@nexus.local",
    password: "tech123",
    firstName: "Alexandre",
    lastName: "Dubois",
    role: "TECHNICIAN",
  },
  // Demo client portal users — these use the unified portal URL and are
  // resolved to their organization via their email domain
  {
    id: "usr_client_acme",
    email: "robert.martin@acme.com",
    password: "client123",
    firstName: "Robert",
    lastName: "Martin",
    role: "CLIENT_USER",
  },
  {
    id: "usr_client_global",
    email: "catherine.lemieux@globalfinance.ca",
    password: "client123",
    firstName: "Catherine",
    lastName: "Lemieux",
    role: "CLIENT_USER",
  },
  {
    id: "usr_client_techstart",
    email: "emilie.roy@techstart.io",
    password: "client123",
    firstName: "Émilie",
    lastName: "Roy",
    role: "CLIENT_USER",
  },
];

/**
 * Build the user object that will be stored in the JWT, enriched with
 * portal organization data when applicable.
 */
function enrichUserWithOrg(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}, org?: PortalOrg | null) {
  if (org) {
    return {
      ...user,
      role: "CLIENT_USER",
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      portalRole: org.defaultRole,
    };
  }
  return user;
}

const providers: any[] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email as string | undefined;
      const password = credentials?.password as string | undefined;
      if (!email || !password) return null;

      // 1. Try the database first (real users)
      try {
        const dbUser = await prisma.user.findUnique({ where: { email } });
        if (dbUser && dbUser.passwordHash) {
          // In dev: plain comparison; in prod use bcrypt.compare
          if (dbUser.passwordHash === password) {
            return {
              id: dbUser.id,
              email: dbUser.email,
              firstName: dbUser.firstName,
              lastName: dbUser.lastName,
              role: dbUser.role,
            };
          }
        }
      } catch {
        // DB not reachable — fall through to demo users
      }

      // 2. Fallback: demo users
      const user = DEMO_USERS.find(
        (u) => u.email === email && u.password === password
      );
      if (!user) return null;

      const org = user.role === "CLIENT_USER" ? resolveOrgByEmail(email) : null;
      return enrichUserWithOrg(
        {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        org
      );
    },
  }),
];

// Add Microsoft EntraID provider only when configured
if (
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // "common" allows any Azure AD tenant — that's what we want for a
      // unified portal that recognizes the org from the user's tenant
      issuer:
        process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ||
        "https://login.microsoftonline.com/common/v2.0",
      authorization: {
        params: { scope: "openid profile email User.Read" },
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-secret-please-change-in-production",
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    /**
     * Auto-provisioning hook — called every time a user signs in.
     * For Microsoft sign-ins, we resolve the org from the Azure tenant
     * id (if known) or from the email domain. We let the sign-in proceed
     * if the user belongs to a known portal org, otherwise we deny.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider === "microsoft-entra-id") {
        const email = (user.email || (profile as any)?.email) as
          | string
          | undefined;
        const tenantId = (profile as any)?.tid as string | undefined;
        if (!email) return false;

        const org =
          resolveOrgByAzureTenant(tenantId) || resolveOrgByEmail(email);
        if (!org) {
          // Unknown tenant/domain — deny
          return false;
        }

        // Stash org info on the user object so jwt() can pick it up
        (user as any).organizationId = org.id;
        (user as any).organizationName = org.name;
        (user as any).organizationSlug = org.slug;
        (user as any).portalRole = org.defaultRole;
        (user as any).role = "CLIENT_USER";

        // Try to extract first/last name from MS profile
        const ms = profile as any;
        if (ms?.given_name) (user as any).firstName = ms.given_name;
        if (ms?.family_name) (user as any).lastName = ms.family_name;
        if (!(user as any).firstName && user.name) {
          const parts = user.name.split(" ");
          (user as any).firstName = parts[0];
          (user as any).lastName = parts.slice(1).join(" ");
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.email = user.email as string;
        token.firstName = (user as any).firstName;
        token.lastName = (user as any).lastName;
        token.role = (user as any).role;
        token.organizationId = (user as any).organizationId;
        token.organizationName = (user as any).organizationName;
        token.organizationSlug = (user as any).organizationSlug;
        token.portalRole = (user as any).portalRole;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.email = token.email as string;
      (session.user as any).firstName = token.firstName as string;
      (session.user as any).lastName = token.lastName as string;
      (session.user as any).role = token.role as string;
      (session.user as any).organizationId = token.organizationId;
      (session.user as any).organizationName = token.organizationName;
      (session.user as any).organizationSlug = token.organizationSlug;
      (session.user as any).portalRole = token.portalRole;
      return session;
    },
  },
});
