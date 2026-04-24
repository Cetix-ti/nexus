import { auth } from "@/lib/auth";
import { ROLES_HIERARCHY } from "@/lib/constants";
import prisma from "@/lib/prisma";
import { getRolePermissions, hasCachedRolePermission } from "@/lib/permissions/resolve";

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
  // Rôle custom optionnel assigné à l'utilisateur via Rôles & Permissions.
  // Si présent, ses permissions s'ajoutent à celles du role système.
  customRoleKey: string | null;
  // Accès "override personnel" définis sur l'utilisateur directement
  // (rétro-compat — ces tags continuent de fonctionner). À terme, les
  // accès sont gérés par rôle dans Rôles & Permissions.
  capabilities: string[];
  // Permissions accordées au rôle système de l'utilisateur + son rôle
  // custom s'il en a un (union pré-résolue par getCurrentUser).
  rolePermissions: string[];
}

// Cache active status checks for 60 seconds to avoid hitting DB on every API call
const activeCache = new Map<string, { active: boolean; capabilities: string[]; customRoleKey: string | null; checkedAt: number }>();
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
  const roleStr = session.user.role as UserRole;

  // SECURITY: Verify user is still active in DB (cached for 60s)
  let capabilities: string[] = [];
  let customRoleKey: string | null = null;
  const cached = activeCache.get(userId);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    if (!cached.active) return null;
    capabilities = cached.capabilities;
    customRoleKey = cached.customRoleKey;
  } else {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isActive: true, capabilities: true, customRoleKey: true },
      });
      const isActive = dbUser?.isActive ?? false;
      capabilities = dbUser?.capabilities ?? [];
      customRoleKey = dbUser?.customRoleKey ?? null;
      activeCache.set(userId, { active: isActive, capabilities, customRoleKey, checkedAt: Date.now() });
      if (!isActive) return null;
    } catch {
      // If DB is unreachable, allow access based on session (graceful degradation)
    }
  }

  // Résout les permissions accordées au rôle système + au rôle custom
  // (si assigné). Union des deux → hasCapability est synchrone partout.
  let rolePermissions: string[] = [];
  try {
    const systemPerms = await getRolePermissions(roleStr);
    const merged = new Set(systemPerms);
    if (customRoleKey) {
      const customPerms = await getRolePermissions(customRoleKey);
      for (const p of customPerms) merged.add(p);
    }
    rolePermissions = Array.from(merged);
  } catch {
    // DB down → les grants de rôle ne s'appliquent pas, mais les
    // user.capabilities individuels continuent de fonctionner.
  }

  return {
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    role: roleStr,
    customRoleKey,
    capabilities,
    rolePermissions,
  };
}

/**
 * Vérifie si un user a une capacité / permission donnée.
 * Union de deux sources :
 *   1. user.capabilities — override personnel (legacy + cas granulaires)
 *   2. rolePermissions — grant accordé au rôle via Rôles & Permissions
 *
 * Pas de bypass implicite pour SUPER_ADMIN : même un super-admin doit
 * avoir l'accès accordé (soit personnellement, soit via son rôle).
 * L'UI seedée accorde par défaut aucune des 3 capacités spéciales
 * (finances/billing/purchasing) → l'admin les octroie explicitement.
 */
export function hasCapability(user: AuthUser, cap: string): boolean {
  if (user.capabilities.includes(cap)) return true;
  if (user.rolePermissions.includes(cap)) return true;
  // Fallback cache lookup — au cas où rolePermissions n'a pas été
  // pré-résolu (ex. un worker qui construit un AuthUser à la main).
  return hasCachedRolePermission(user.role, cap);
}

/**
 * Alias sémantique pour les permissions "techniques" (tickets.delete,
 * settings.general, etc.). Pour l'instant, identique à hasCapability —
 * mais garder des call sites distincts facilite la lecture et permet
 * de divergencer plus tard si besoin (ex. permissions hiérarchiques).
 */
export function hasPermission(user: AuthUser, permissionKey: string): boolean {
  return hasCapability(user, permissionKey);
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
