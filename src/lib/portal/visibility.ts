// ============================================================================
// Visibility filter — règle unique partagée par tous les modules documentaires
// (Particularités, Politiques, Logiciels, Changements, Documents).
//
// Usage côté agents : aucun filtre (ils voient tout selon leur rôle).
// Usage côté portail : `filterByPortalVisibility(items, portalRole)` passe
// en un point unique pour respecter la matrice définie dans le plan.
// ============================================================================

import type { ContentVisibility } from "@prisma/client";
import type { PortalRole } from "@prisma/client";

/** Niveau de visibilité d'un contenu, typé depuis l'enum Prisma. */
export type Visibility = ContentVisibility;

/**
 * Détermine si un rôle portail peut voir un contenu donné.
 * - INTERNAL    : jamais côté portail
 * - CLIENT_ADMIN : uniquement ADMIN
 * - CLIENT_ALL  : tous (ADMIN, MANAGER, STANDARD, VIEWER)
 */
export function canSeeInPortal(
  visibility: Visibility,
  portalRole: PortalRole | null | undefined,
): boolean {
  if (!portalRole) return false;
  if (visibility === "INTERNAL") return false;
  if (visibility === "CLIENT_ADMIN") return portalRole === "ADMIN";
  return true; // CLIENT_ALL
}

/** Filtre un tableau en gardant uniquement les éléments visibles par le rôle. */
export function filterByPortalVisibility<T extends { visibility: Visibility }>(
  items: T[],
  portalRole: PortalRole | null | undefined,
): T[] {
  return items.filter((it) => canSeeInPortal(it.visibility, portalRole));
}

/**
 * Clause Prisma pour filtrer par visibilité côté portail. À utiliser dans
 * les routes `/api/portal/**` pour garantir que rien d'INTERNAL ne fuit.
 *
 *   where: { organizationId, ...portalVisibilityWhere(role) }
 */
export function portalVisibilityWhere(
  portalRole: PortalRole | null | undefined,
): { visibility?: { in: Visibility[] } } {
  if (!portalRole) return { visibility: { in: [] as Visibility[] } };
  if (portalRole === "ADMIN") return { visibility: { in: ["CLIENT_ADMIN", "CLIENT_ALL"] } };
  return { visibility: { in: ["CLIENT_ALL"] } };
}
