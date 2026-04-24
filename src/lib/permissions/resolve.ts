// ============================================================================
// resolve — lookup runtime des permissions accordées à un rôle.
//
// hasCapability / hasPermission appellent getRolePermissions(roleKey),
// qui lit RolePermission en DB avec un cache en mémoire (TTL 60 s pour
// amortir les centaines d'appels par requête API).
//
// Seed lazy : si la table est vide pour un roleKey (cas vide au premier
// boot, ou ajout d'un nouveau rôle système), on insère les défauts de
// DEFAULT_ROLE_PERMISSIONS puis on relit. Idempotent via @@unique.
// ============================================================================

import prisma from "@/lib/prisma";
import { DEFAULT_ROLE_PERMISSIONS } from "./defs";

const cache = new Map<string, { perms: Set<string>; loadedAt: number }>();
const CACHE_TTL = 60_000;

/**
 * Invalide le cache (à appeler après un PUT/DELETE sur les permissions
 * d'un rôle — l'API roles/permissions s'en charge).
 */
export function invalidateRolePermissionsCache(roleKey?: string) {
  if (roleKey) cache.delete(roleKey);
  else cache.clear();
}

/**
 * Liste des permissions accordées au rôle donné. Seedé automatiquement
 * depuis DEFAULT_ROLE_PERMISSIONS au premier accès si aucune ligne
 * n'existe en DB.
 */
export async function getRolePermissions(roleKey: string): Promise<Set<string>> {
  const cached = cache.get(roleKey);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.perms;
  }

  let rows = await prisma.rolePermission.findMany({
    where: { roleKey },
    select: { permissionKey: true },
  });

  // Seed lazy : on ne seed que les rôles SYSTÈME avec un défaut connu.
  // Les rôles custom partent avec une matrice vide — c'est à l'admin
  // de la remplir via l'UI.
  if (rows.length === 0 && DEFAULT_ROLE_PERMISSIONS[roleKey]) {
    const defaults = DEFAULT_ROLE_PERMISSIONS[roleKey];
    await prisma.rolePermission.createMany({
      data: defaults.map((permissionKey) => ({ roleKey, permissionKey })),
      skipDuplicates: true,
    });
    rows = await prisma.rolePermission.findMany({
      where: { roleKey },
      select: { permissionKey: true },
    });
  }

  const perms = new Set(rows.map((r) => r.permissionKey));
  cache.set(roleKey, { perms, loadedAt: Date.now() });
  return perms;
}

/**
 * Raccourci synchrone UNIQUEMENT depuis un contexte où on a déjà
 * pré-résolu le set (ex. middleware qui a attaché req.permissions).
 * Sinon utiliser getRolePermissions async.
 */
export function hasCachedRolePermission(roleKey: string, permissionKey: string): boolean {
  const cached = cache.get(roleKey);
  if (!cached) return false;
  if (Date.now() - cached.loadedAt >= CACHE_TTL) return false;
  return cached.perms.has(permissionKey);
}
