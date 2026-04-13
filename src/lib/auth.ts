import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import {
  resolveOrgByEmail,
  getDefaultRole,
} from "@/lib/portal/org-resolver";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId?: string;
    organizationName?: string;
    organizationSlug?: string;
    portalRole?: "standard" | "viewer" | "manager" | "admin";
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
      portalRole?: "standard" | "viewer" | "manager" | "admin";
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve a portal contact from the DB by email, and enrich the user object
 * with org + portal role info for the JWT.
 *
 * Auto-provisioning: if the email domain matches an org with portal enabled,
 * but no contact exists yet, one is created automatically with the org's
 * default role. This avoids needing per-tenant SAML/SSO config — any user
 * whose email domain matches a known org can sign in via Microsoft/Google.
 */
async function resolvePortalContact(
  email: string,
  profile?: { firstName?: string; lastName?: string },
) {
  const org = await resolveOrgByEmail(email);
  if (!org || !org.portalEnabled) return null;

  // Find existing contact
  let contact = await prisma.contact.findFirst({
    where: {
      organizationId: org.id,
      email: { equals: email, mode: "insensitive" },
    },
    include: { portalAccess: true },
  });

  // Auto-provision contact if it doesn't exist
  if (!contact) {
    const nameParts = email.split("@")[0].split(/[._-]/);
    const firstName =
      profile?.firstName ||
      (nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : "Utilisateur");
    const lastName =
      profile?.lastName ||
      (nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : "");

    contact = await prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName,
        lastName,
        email: email.toLowerCase(),
        portalEnabled: true,
        portalStatus: "active",
      },
      include: { portalAccess: true },
    });

    // Create portal access with default role
    const defaultRole = getDefaultRole(org);
    const isAdmin = defaultRole === "ADMIN";
    const isManager = defaultRole === "MANAGER";

    await prisma.portalAccessUser.create({
      data: {
        organizationId: org.id,
        contactId: contact.id,
        name: `${firstName} ${lastName}`.trim(),
        email: email.toLowerCase(),
        portalRole: defaultRole,
        canAccessPortal: true,
        canSeeOwnTickets: true,
        canSeeAllOrgTickets: isAdmin || isManager,
        canCreateTickets: true,
        canSeeProjects: isAdmin || isManager,
        canSeeProjectDetails: isAdmin || isManager,
        canSeeProjectTasks: isAdmin,
        canSeeProjectLinkedTickets: isAdmin,
        canSeeReports: isAdmin || isManager,
        canSeeBillingReports: isAdmin,
        canSeeTimeReports: isAdmin,
        canSeeHourBankBalance: isAdmin,
        canSeeDocuments: isAdmin || isManager,
        canSeeTeamMembers: isAdmin || isManager,
        canSeeOwnAssets: true,
        canSeeAllOrgAssets: isAdmin || isManager,
        canManageAssets: isAdmin,
        canManageContacts: isAdmin,
      },
    });

    // Re-fetch with portalAccess included
    contact = await prisma.contact.findUnique({
      where: { id: contact.id },
      include: { portalAccess: true },
    });
  }

  if (!contact) return null;

  // Enable portal if not yet enabled (for pre-existing contacts)
  if (!contact.portalEnabled) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { portalEnabled: true },
    });
  }

  const portalRole = contact.portalAccess?.portalRole ?? getDefaultRole(org);

  return {
    contactId: contact.id,
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    portalRole: portalRole.toLowerCase() as "standard" | "viewer" | "manager" | "admin",
    firstName: contact.firstName,
    lastName: contact.lastName,
  };
}

// ============================================================================
// Providers
// ============================================================================

const providers: any[] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = (credentials?.email as string)?.toLowerCase()?.trim();
      const password = credentials?.password as string;
      if (!email || !password) return null;

      // 1. Try DB — MSP agents (User table)
      try {
        const dbUser = await prisma.user.findUnique({
          where: { email },
        });
        if (dbUser?.passwordHash) {
          // SECURITY: Block inactive users
          if (!dbUser.isActive) return null;

          // SECURITY: Only use bcrypt in production (no plain-text comparison)
          const match = await bcrypt.compare(password, dbUser.passwordHash);
          if (match) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { lastLoginAt: new Date() },
            });
            return {
              id: dbUser.id,
              email: dbUser.email,
              firstName: dbUser.firstName,
              lastName: dbUser.lastName,
              role: dbUser.role,
              avatar: dbUser.avatar,
            } as any;
          }
        }
      } catch {
        // DB not reachable — fall through
      }

      // 2. Try DB — Portal contacts (Contact table with passwordHash)
      try {
        const contact = await prisma.contact.findFirst({
          where: { email: { equals: email, mode: "insensitive" }, portalEnabled: true },
          include: { organization: true, portalAccess: true },
        });
        if (contact?.passwordHash) {
          // SECURITY: Block inactive contacts
          if (!contact.isActive) return null;
          // SECURITY: Block if organization is inactive
          if (!contact.organization.isActive) return null;
          // SECURITY: Block if portal is not enabled for the org
          if (!contact.organization.portalEnabled) return null;

          const match = await bcrypt.compare(password, contact.passwordHash);
          if (match) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { lastPortalLoginAt: new Date() },
            });
            const portalRole =
              contact.portalAccess?.portalRole?.toLowerCase() ?? "standard";
            return {
              id: contact.id,
              email: contact.email,
              firstName: contact.firstName,
              lastName: contact.lastName,
              role: "CLIENT_USER",
              organizationId: contact.organizationId,
              organizationName: contact.organization.name,
              organizationSlug: contact.organization.slug,
              portalRole: portalRole as "standard" | "viewer" | "manager" | "admin",
            };
          }
        }
      } catch {
        // DB not reachable — fall through
      }

      // No demo fallback in production
      return null;
    },
  }),
];

// Microsoft Entra ID
if (
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer:
        process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ||
        "https://login.microsoftonline.com/common/v2.0",
      authorization: {
        params: { scope: "openid profile email User.Read" },
      },
    }),
  );
}

// Google OAuth
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

// ============================================================================
// NextAuth config
// ============================================================================

// Detect if behind a reverse proxy (HTTPS terminated at proxy, HTTP to app)
const isProduction = process.env.NODE_ENV === "production";
const useSecureCookies = process.env.AUTH_URL?.startsWith("https://") ?? false;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-secret-please-change-in-production",
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  // Cookie config for reverse proxy: when proxy terminates SSL,
  // the app runs on HTTP but browser sees HTTPS. We need to set
  // secure cookies only when the public URL is HTTPS.
  cookies: useSecureCookies
    ? {
        sessionToken: {
          name: "__Secure-authjs.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
          },
        },
        csrfToken: {
          name: "__Host-authjs.csrf-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
          },
        },
      }
    : undefined,
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      // OAuth providers (Microsoft, Google)
      if (
        account?.provider === "microsoft-entra-id" ||
        account?.provider === "google"
      ) {
        const email = (
          user.email ||
          (profile as any)?.email
        ) as string | undefined;
        console.log("[auth] OAuth signIn — provider:", account?.provider, "email:", email);
        if (!email) { console.log("[auth] No email, rejecting"); return false; }

        const p = profile as any;
        const oauthFirstName = p?.given_name || user.name?.split(" ")[0];
        const oauthLastName = p?.family_name || user.name?.split(" ").slice(1).join(" ");

        // 1) Check if this email belongs to an AGENT (User table)
        const agentUser = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        console.log("[auth] Agent lookup:", agentUser ? `found id=${agentUser.id} active=${agentUser.isActive}` : "not found");

        if (agentUser) {
          if (!agentUser.isActive) { console.log("[auth] Agent inactive, rejecting"); return false; }
          // Authenticate as agent — populate user object like credentials provider
          (user as any).id = agentUser.id;
          (user as any).email = agentUser.email;
          (user as any).firstName = agentUser.firstName;
          (user as any).lastName = agentUser.lastName;
          (user as any).role = agentUser.role;
          // Update last login
          await prisma.user.update({
            where: { id: agentUser.id },
            data: { lastLoginAt: new Date() },
          }).catch(() => {});
          return true;
        }

        // 2) Not an agent — try to resolve as portal client contact
        console.log("[auth] Trying portal contact resolution for:", email);
        const portal = await resolvePortalContact(email, {
          firstName: oauthFirstName,
          lastName: oauthLastName,
        });
        console.log("[auth] Portal result:", portal ? `contactId=${portal.contactId}` : "null — REJECTING");
        if (!portal) {
          return false;
        }

        // Update contact names from OAuth if they were auto-provisioned with guessed names
        if (oauthFirstName && oauthFirstName !== portal.firstName) {
          try {
            await prisma.contact.update({
              where: { id: portal.contactId },
              data: {
                firstName: oauthFirstName,
                ...(oauthLastName ? { lastName: oauthLastName } : {}),
              },
            });
            portal.firstName = oauthFirstName;
            if (oauthLastName) portal.lastName = oauthLastName;
          } catch { /* ignore */ }
        }

        (user as any).id = portal.contactId;
        (user as any).organizationId = portal.organizationId;
        (user as any).organizationName = portal.organizationName;
        (user as any).organizationSlug = portal.organizationSlug;
        (user as any).portalRole = portal.portalRole;
        (user as any).role = "CLIENT_USER";
        (user as any).firstName = portal.firstName;
        (user as any).lastName = portal.lastName;
      }
      return true;
    },

    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.firstName = (user as any).firstName;
        token.lastName = (user as any).lastName;
        token.role = (user as any).role;
        // Avatar is NOT stored in JWT (too large for cookies).
        // Components fetch it from /api/v1/users or use a shared store.
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
      (session.user as any).firstName = token.firstName;
      (session.user as any).lastName = token.lastName;
      (session.user as any).role = token.role;
      (session.user as any).organizationId = token.organizationId;
      (session.user as any).organizationName = token.organizationName;
      (session.user as any).organizationSlug = token.organizationSlug;
      (session.user as any).portalRole = token.portalRole;
      return session;
    },
  },
});
