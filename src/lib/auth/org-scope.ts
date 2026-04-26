// ============================================================================
// SCOPING PAR ORGANISATION (Phase 9)
//
// Helpers pour contraindre les requêtes Prisma aux organisations qu'un
// utilisateur a le droit de voir. Utilisé par tous les endpoints qui
// retournent des entités liées à une org (tickets, time entries, reports,
// etc.).
//
// Règles :
//   - SUPER_ADMIN bypass — toujours "all"
//   - User sans aucune row UserOrganizationScope = accès complet ("all")
//     (comportement par défaut, rétrocompatible avec l'avant Phase 9)
//   - User avec 1+ rows = restreint aux orgs listées uniquement, peu
//     importe son rôle (un MSP_ADMIN limité voit aussi seulement ces orgs)
//
// Convention : la fonction renvoie "all" quand il n'y a pas de filtre à
// appliquer (utilisé partout dans les `where` Prisma sous la forme
// `if (allowed !== "all") where.organizationId = { in: allowed }`).
// ============================================================================

import prisma from "@/lib/prisma";
import type { UserRole } from "@/lib/auth-utils";

export type AllowedOrgIds = "all" | string[];

/**
 * Renvoie la liste des organisations auxquelles l'utilisateur a accès.
 *
 *   - "all" : aucune restriction (super-admin OU aucun scope défini)
 *   - string[] : liste explicite des orgs autorisées
 *
 * Si la liste est vide (cas pathologique : user à qui on a explicitement
 * retiré toutes les orgs), on renvoie un tableau vide — le caller doit
 * traiter ça comme "0 résultat" et non comme "tous".
 */
export async function getAllowedOrgIds(
  userId: string,
  role: UserRole,
): Promise<AllowedOrgIds> {
  if (role === "SUPER_ADMIN") return "all";
  const scopes = await prisma.userOrganizationScope.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  if (scopes.length === 0) return "all";
  return scopes.map((s) => s.organizationId);
}

/**
 * Construit le filtre Prisma à injecter dans un `where` quand l'entité
 * cible a un champ `organizationId` (ou un alias). Renvoie `null` quand
 * aucun filtre ne s'applique (l'appelant ne doit alors RIEN ajouter au
 * where, pour ne pas casser des requêtes existantes).
 *
 * @example
 *   const filter = await orgScopeWhere(me.id, me.role);
 *   const tickets = await prisma.ticket.findMany({
 *     where: { ...filter, status: "open" },
 *   });
 */
export async function orgScopeWhere(
  userId: string,
  role: UserRole,
  field: string = "organizationId",
): Promise<Record<string, unknown> | null> {
  const allowed = await getAllowedOrgIds(userId, role);
  if (allowed === "all") return null;
  return { [field]: { in: allowed } };
}

/**
 * Vérifie qu'un user a le droit de toucher une org donnée. Utile dans
 * les routes mutation (POST/PATCH/DELETE) avant d'appliquer le change.
 */
export async function userCanAccessOrg(
  userId: string,
  role: UserRole,
  organizationId: string,
): Promise<boolean> {
  const allowed = await getAllowedOrgIds(userId, role);
  if (allowed === "all") return true;
  return allowed.includes(organizationId);
}
