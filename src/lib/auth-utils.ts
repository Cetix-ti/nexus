import { auth } from "@/lib/auth";
import { ROLES_HIERARCHY } from "@/lib/constants";
import prisma from "@/lib/prisma";

export type UserRole =
  | "SUPER_ADMIN"
  | "MSP_ADMIN"
  | "SUPERVISOR"
  | "TECHNICIAN"
  | "CLIENT_ADMIN"
  | "CLIENT_USER"
  | "READ_ONLY";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

// Cache active status checks for 60 seconds to avoid hitting DB on every API call
const activeCache = new Map<string, { active: boolean; checkedAt: number }>();
const CACHE_TTL = 60_000; // 60 seconds

/**
 * Get the current authenticated user from the session.
 * Returns null if not authenticated OR if the user has been deactivated.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const userId = session.user.id;

  // SECURITY: Verify user is still active in DB (cached for 60s)
  const cached = activeCache.get(userId);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    if (!cached.active) return null;
  } else {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isActive: true },
      });
      const isActive = dbUser?.isActive ?? false;
      activeCache.set(userId, { active: isActive, checkedAt: Date.now() });
      if (!isActive) return null;
    } catch {
      // If DB is unreachable, allow access based on session (graceful degradation)
    }
  }

  return {
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    role: session.user.role as UserRole,
  };
}

/**
 * Require authentication. Throws an error if the user is not authenticated.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication required");
  }

  return user;
}

/**
 * Get the numeric level of a role from the hierarchy.
 * Lower number = higher privilege.
 */
function getRoleLevel(role: UserRole): number {
  return ROLES_HIERARCHY[role] ?? 999;
}

/**
 * Check if the current user has at least the specified role level.
 * Throws if not authenticated or insufficient privileges.
 *
 * @param minimumRole - The minimum role required (e.g., SUPERVISOR means SUPER_ADMIN, MSP_ADMIN, and SUPERVISOR are allowed)
 */
export async function requireRole(minimumRole: UserRole): Promise<AuthUser> {
  const user = await requireAuth();

  const userLevel = getRoleLevel(user.role);
  const requiredLevel = getRoleLevel(minimumRole);

  if (userLevel > requiredLevel) {
    throw new Error(
      `Insufficient permissions. Required: ${minimumRole}, current: ${user.role}`
    );
  }

  return user;
}

/**
 * Check if a given role meets the minimum role requirement (without throwing).
 */
export function hasMinimumRole(
  userRole: UserRole,
  minimumRole: UserRole
): boolean {
  return getRoleLevel(userRole) <= getRoleLevel(minimumRole);
}

/**
 * Returns true if the role is a staff role (MSP side), false for CLIENT_* roles.
 */
export function isStaffRole(role: UserRole): boolean {
  return !role.startsWith("CLIENT_") && role !== "READ_ONLY";
}

/**
 * Require the current user to be staff (not a CLIENT_* role).
 * Returns the user if staff, null otherwise (caller should return 403).
 */
export async function getCurrentStaff(): Promise<AuthUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role.startsWith("CLIENT_")) return null;
  return user;
}
