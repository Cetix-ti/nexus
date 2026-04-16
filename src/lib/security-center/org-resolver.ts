// Résout une Organization à partir d'un domaine d'expéditeur ou d'un
// identifiant endpoint. Réutilisable par tous les décodeurs pour garantir
// un mapping cohérent.
//
// Stratégie :
//   1. Match strict sur Organization.domain (champ principal).
//   2. Fallback sur un domaine secondaire présent dans la liste `domains`
//      (ancienne schema ou alias).
//   3. Match partiel sur le clientCode (ex: endpoint "MRVL-DC01" → org
//      "MRVL").
//   4. Sinon null — le décodeur peut décider d'accepter null (alerte
//      "orpheline" à l'admin de mapper manuellement).

import prisma from "@/lib/prisma";

const cache = new Map<string, string | null>();

export async function resolveOrgByDomain(
  domain: string,
): Promise<string | null> {
  const needle = domain.trim().toLowerCase();
  if (!needle) return null;
  if (cache.has(needle)) return cache.get(needle) ?? null;
  const org = await prisma.organization.findFirst({
    where: {
      OR: [
        { domain: { equals: needle, mode: "insensitive" } },
        { domains: { has: needle } },
      ],
    },
    select: { id: true },
  });
  cache.set(needle, org?.id ?? null);
  return org?.id ?? null;
}

/** Résout l'org depuis un nom d'endpoint en extrayant le préfixe ou en
 *  matchant le clientCode. Les conventions de nommage varient ; on tente
 *  deux règles simples. */
export async function resolveOrgByEndpoint(
  endpoint: string,
): Promise<string | null> {
  const clean = endpoint.trim();
  if (!clean) return null;
  // Convention fréquente : "CODE-HOST01" → prefix = CODE
  const prefix = clean.split(/[-_. ]/)[0].toUpperCase();
  if (prefix.length >= 2 && prefix.length <= 8) {
    const org = await prisma.organization.findFirst({
      where: { clientCode: prefix },
      select: { id: true },
    });
    if (org) return org.id;
  }
  return null;
}

export function invalidateOrgResolverCache() {
  cache.clear();
}
