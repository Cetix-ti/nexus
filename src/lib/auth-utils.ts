import { auth } from "@/lib/auth";
import { ROLES_HIERARCHY } from "@/lib/constants";

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

/**
 * Get the current authenticated user from the session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth();

  if (!session?.user) {
    return null;
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
