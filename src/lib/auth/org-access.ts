// ============================================================================
// Helpers d'autorisation cross-organisation.
//
// Modèle MSP : les staff (SUPER_ADMIN, MSP_ADMIN, SUPERVISOR, TECHNICIAN)
// ont accès à toutes les orgs clientes. Les rôles CLIENT_* / READ_ONLY
// doivent avoir une UserOrganization active sur l'org ciblée.
//
// Usage typique (routes API qui ciblent une ressource d'org) :
//
//   const me = await getCurrentUser();
//   if (!me) return json401();
//   const guard = await assertUserOrgAccess(me, orgId);
//   if (!guard.ok) return guard.res;
//
// Sur une ressource enfant déjà chargée :
//   const guard = assertSameOrg(me, resource.organizationId, { resource: "particularity" });
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isStaffRole, type AuthUser } from "@/lib/auth-utils";
import { getAllowedOrgIds } from "@/lib/auth/org-scope";

export type AccessDenied = { ok: false; res: Response; reason: "unauth" | "forbidden" | "notfound" };
export type AccessGranted = { ok: true };
export type AccessResult = AccessGranted | AccessDenied;

function forbidden(msg = "Forbidden"): AccessDenied {
  return { ok: false, res: NextResponse.json({ error: msg }, { status: 403 }), reason: "forbidden" };
}
function notfound(msg = "Not found"): AccessDenied {
  return { ok: false, res: NextResponse.json({ error: msg }, { status: 404 }), reason: "notfound" };
}

/**
 * Autorise l'accès d'un user à une organisation ciblée.
 * Staff MSP : toujours autorisé. Client : membership active requise.
 */
export async function assertUserOrgAccess(
  me: AuthUser,
  organizationId: string | null | undefined,
): Promise<AccessResult> {
  if (!organizationId) return forbidden("Organisation manquante");
  if (isStaffRole(me.role)) {
    // Phase 9 — un staff peut être limité à un sous-ensemble d'orgs
    // (technicien dédié à HVAC, par exemple). Sans row dans
    // UserOrganizationScope = accès complet (rétrocompat).
    const allowed = await getAllowedOrgIds(me.id, me.role);
    if (allowed === "all" || allowed.includes(organizationId)) {
      return { ok: true };
    }
    return forbidden();
  }
  const membership = await prisma.userOrganization.findFirst({
    where: { userId: me.id, organizationId },
    select: { id: true },
  });
  if (!membership) return forbidden();
  return { ok: true };
}

/**
 * Variante synchrone : compare l'org attendue et l'org de la ressource chargée.
 * Staff MSP bypass. Pour clients, on exige que l'org de la ressource
 * corresponde à une org à laquelle le user est rattaché — le caller doit
 * avoir déjà chargé/vérifié le rattachement OU appeler assertUserOrgAccess.
 *
 * Utile après un `findUnique` pour s'assurer que la ressource trouvée
 * correspond bien à l'org du user (empêche IDOR sur /:id).
 */
export async function assertSameOrg(
  me: AuthUser,
  resourceOrgId: string | null | undefined,
): Promise<AccessResult> {
  if (!resourceOrgId) return notfound();
  return assertUserOrgAccess(me, resourceOrgId);
}

/**
 * Raccourci : récupère le user ou renvoie 401. Sinon appelle assertUserOrgAccess.
 * Ne s'utilise pas directement car les callers ont besoin du user — voir
 * requireOrgAccess pour un wrapper complet.
 */
export async function requireOrgAccess(
  me: AuthUser | null,
  organizationId: string | null | undefined,
): Promise<{ ok: true; me: AuthUser } | AccessDenied> {
  if (!me) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), reason: "unauth" };
  const r = await assertUserOrgAccess(me, organizationId);
  if (!r.ok) return r;
  return { ok: true, me };
}

/**
 * Liste des orgIds auxquelles un user a accès.
 * Pour staff : null (signifie "toutes" — caller ne doit pas filtrer).
 * Pour client : array d'orgIds (peut être vide).
 */
export async function getAccessibleOrgIds(me: AuthUser): Promise<string[] | null> {
  if (isStaffRole(me.role)) {
    // Phase 9 — un staff peut être restreint à des orgs spécifiques.
    // null = pas de filtre (rétrocompat). Tableau = orgs autorisées.
    const allowed = await getAllowedOrgIds(me.id, me.role);
    return allowed === "all" ? null : allowed;
  }
  const rows = await prisma.userOrganization.findMany({
    where: { userId: me.id },
    select: { organizationId: true },
  });
  return rows.map((r) => r.organizationId);
}
