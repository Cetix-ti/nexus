// ============================================================================
// Post-résolution des labels cuid/legacy en noms humains.
//
// Certains champs de type "relation" ne sont pas incluables via Prisma
// (ex. TimeEntry.agentId n'a pas de relation déclarée). Ils ressortent
// en clair dans les résultats sous forme de cuid (ex. cmnp2evlq001…) ou
// d'identifiants legacy issus de l'import Freshservice (org_acme_corp,
// ct_john_doe, usr_fs_42).
//
// Cette fonction prend la liste de résultats + la connaissance du champ
// groupé, détecte les labels résolvables, et les résout en batch via
// User/Organization/Ticket/Contract/Category. Les IDs legacy `org_*`
// sont matchés contre Organization.slug ; s'ils pointent vers la MÊME
// organisation qu'un cuid présent dans la liste, les deux lignes
// fusionnent sous le nom canonique (somme des valeurs).
// ============================================================================

import prisma from "@/lib/prisma";

const CUID_RE = /^c[a-z0-9]{20,30}$/i;
const LEGACY_ORG_RE = /^org_[a-z0-9_]+$/i;
const LEGACY_CONTACT_RE = /^ct_[a-z0-9_]+$/i;
const LEGACY_USER_RE = /^usr_fs_[0-9]+$/i;

function isResolvable(label: string): boolean {
  return (
    CUID_RE.test(label) ||
    LEGACY_ORG_RE.test(label) ||
    LEGACY_CONTACT_RE.test(label) ||
    LEGACY_USER_RE.test(label)
  );
}

export async function resolveLabels<T extends { label: string; value: number }>(
  results: T[],
  groupField: string | undefined,
): Promise<T[]> {
  if (!results.length) return results;

  // Collecte les labels résolvables : cuid ("cmnp…") ou IDs legacy
  // Freshservice ("org_acme_corp", "ct_john_doe", "usr_fs_42").
  const resolvableLabels = Array.from(
    new Set(results.map((r) => r.label).filter(isResolvable)),
  );
  if (resolvableLabels.length === 0) return results;

  const cuids = resolvableLabels.filter((l) => CUID_RE.test(l));
  const legacyOrgIds = resolvableLabels.filter((l) => LEGACY_ORG_RE.test(l));
  const legacyContactIds = resolvableLabels.filter((l) => LEGACY_CONTACT_RE.test(l));
  const legacyUserIds = resolvableLabels.filter((l) => LEGACY_USER_RE.test(l));

  // Heuristique : selon le nom du champ groupé, on sait quelle table
  // interroger en priorité. Sinon on tente user → organization → ticket.
  const lookup = new Map<string, string>();

  async function tryUsers(ids: string[]) {
    if (ids.length === 0) return;
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    for (const u of users) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;
      lookup.set(u.id, name);
    }
  }

  async function tryOrgs(ids: string[]) {
    if (ids.length === 0) return;
    const orgs = await prisma.organization.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    for (const o of orgs) lookup.set(o.id, o.name);
  }

  /**
   * Résout les IDs legacy `org_slug_like` issus de l'import Freshservice :
   *   1. Tente un match direct par Organization.id (au cas où l'ID legacy
   *      a été persisté tel quel dans la DB).
   *   2. Sinon, strippe le préfixe `org_` et matche contre slug / clientCode
   *      (la fonction d'import utilisait un slug normalisé à partir du nom).
   *   3. Fallback : humanise le suffixe (`org_acme_corp` → `Acme Corp`).
   */
  async function tryLegacyOrgs(ids: string[]) {
    if (ids.length === 0) return;
    const directHits = await prisma.organization.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    for (const o of directHits) lookup.set(o.id, o.name);

    const unresolved = ids.filter((id) => !lookup.has(id));
    if (unresolved.length === 0) return;

    // Candidats slug = tail après "org_"
    const slugs = unresolved.map((id) => id.replace(/^org_/i, ""));
    const bySlug = await prisma.organization.findMany({
      where: { OR: [{ slug: { in: slugs } }, { clientCode: { in: slugs.map((s) => s.toUpperCase()) } }] },
      select: { id: true, slug: true, clientCode: true, name: true },
    });
    for (const id of unresolved) {
      const tail = id.replace(/^org_/i, "").toLowerCase();
      const match =
        bySlug.find((o) => (o.slug ?? "").toLowerCase() === tail) ||
        bySlug.find((o) => (o.clientCode ?? "").toLowerCase() === tail);
      if (match) {
        lookup.set(id, match.name);
      } else {
        // Dernier recours : humanise le suffixe (acme_corp → Acme Corp).
        const pretty = tail
          .split(/[_-]+/)
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        if (pretty) lookup.set(id, pretty);
      }
    }
  }

  async function tryLegacyContacts(ids: string[]) {
    if (ids.length === 0) return;
    const directHits = await prisma.contact.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    for (const c of directHits) {
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.id;
      lookup.set(c.id, name);
    }
    const unresolved = ids.filter((id) => !lookup.has(id));
    if (unresolved.length === 0) return;
    // Email reconstruit depuis l'ID legacy ct_email_at_domain_com.
    const emailGuesses = unresolved.map((id) => id.replace(/^ct_/i, "").replace(/_/g, "."));
    const byEmail = await prisma.contact.findMany({
      where: { email: { in: emailGuesses, mode: "insensitive" } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    for (const id of unresolved) {
      const tail = id.replace(/^ct_/i, "").replace(/_/g, ".").toLowerCase();
      const match = byEmail.find((c) => (c.email ?? "").toLowerCase() === tail);
      if (match) {
        const name = [match.firstName, match.lastName].filter(Boolean).join(" ") || match.email || id;
        lookup.set(id, name);
      }
    }
  }

  async function tryLegacyUsers(ids: string[]) {
    if (ids.length === 0) return;
    // usr_fs_42 → on ne peut plus matcher sans un champ externalId ;
    // on se contente de stripper le préfixe pour l'affichage.
    for (const id of ids) {
      const tail = id.replace(/^usr_fs_/i, "");
      if (tail) lookup.set(id, `Agent FS #${tail}`);
    }
  }

  async function tryTickets(ids: string[]) {
    if (ids.length === 0) return;
    const tickets = await prisma.ticket.findMany({
      where: { id: { in: ids } },
      select: { id: true, number: true, subject: true },
    });
    for (const t of tickets) lookup.set(t.id, `#${t.number} — ${t.subject}`);
  }

  async function tryContracts(ids: string[]) {
    if (ids.length === 0) return;
    const contracts = await prisma.contract.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    for (const c of contracts) lookup.set(c.id, c.name);
  }

  async function tryCategories(ids: string[]) {
    if (ids.length === 0) return;
    const cats = await prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    for (const c of cats) lookup.set(c.id, c.name);
  }

  // Routing par nom de champ — évite de taper 5 tables inutilement.
  const userFields = new Set([
    "agentId", "assigneeId", "creatorId", "submitterId", "requestedById",
    "managerId", "ownerId", "userId", "supervisorId",
  ]);
  const orgFields = new Set(["organizationId", "organization_id"]);
  const ticketFields = new Set(["ticketId", "ticket_id"]);
  const contractFields = new Set(["contractId", "contract_id"]);
  const categoryFields = new Set(["categoryId", "category_id", "ticketCategoryId"]);

  if (groupField && userFields.has(groupField)) {
    await Promise.all([tryUsers(cuids), tryLegacyUsers(legacyUserIds)]);
  } else if (groupField && orgFields.has(groupField)) {
    await Promise.all([tryOrgs(cuids), tryLegacyOrgs(legacyOrgIds)]);
  } else if (groupField && ticketFields.has(groupField)) {
    await tryTickets(cuids);
  } else if (groupField && contractFields.has(groupField)) {
    await tryContracts(cuids);
  } else if (groupField && categoryFields.has(groupField)) {
    await tryCategories(cuids);
  } else {
    // Fallback : tente toutes les tables en parallèle. Légèrement plus
    // coûteux mais acceptable sur quelques dizaines de labels.
    await Promise.all([
      tryUsers(cuids),
      tryOrgs(cuids),
      tryTickets(cuids),
      tryContracts(cuids),
      tryCategories(cuids),
      tryLegacyOrgs(legacyOrgIds),
      tryLegacyContacts(legacyContactIds),
      tryLegacyUsers(legacyUserIds),
    ]);
  }

  // Résolution brute label → nom humain.
  const resolved = results.map((r) => {
    if (!isResolvable(r.label)) return r;
    const hit = lookup.get(r.label);
    return hit ? { ...r, label: hit } : r;
  });

  // Fusion : si deux IDs différents (ex. cuid moderne + legacy "org_xxx")
  // pointent vers le même nom d'organisation, on fusionne leurs valeurs
  // dans une seule ligne. Sans ça, on voit "Acme Corp" deux fois dans
  // le widget (une pour chaque ID source).
  const merged = new Map<string, T>();
  for (const r of resolved) {
    const existing = merged.get(r.label);
    if (existing) {
      existing.value = Number(existing.value) + Number(r.value);
    } else {
      merged.set(r.label, { ...r });
    }
  }
  return Array.from(merged.values());
}
