// Recherche fédérée — query unique sur particularities, policy_documents,
// software_instances, changes, articles (KB existant) avec respect visibility.
// Retour groupé par type.
//
// Sécurité :
//   - Visibility INTERNAL exclue sauf staff MSP (SUPER_ADMIN, MSP_ADMIN,
//     SUPERVISOR). TECHNICIAN et CLIENT_* n'ont pas accès au contenu interne
//     via la recherche globale.
//   - Les clients (rôles CLIENT_*) sont cloués à leurs orgs accessibles ;
//     agents MSP peuvent scoper via ?orgId= mais l'accès est toujours validé.
//   - Politiques de catégorie INTERNAL_ONLY (SCRIPT, PRIVILEGED_ACCESS,
//     KEEPASS) sont retirées pour tout non-staff même si visibility le
//     permet — règle de défense en profondeur.
//   - Articles KB : scope orgId forcé si non staff pour éviter leak KB d'autres orgs.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";
import { getAccessibleOrgIds } from "@/lib/auth/org-access";
import { Prisma } from "@prisma/client";

interface Hit {
  type: "particularity" | "policy_document" | "software" | "change" | "article";
  id: string;
  title: string;
  excerpt: string | null;
  orgId: string | null;
  orgName: string | null;
  url: string;
  rank: number;
}

// Agents MSP admins : plein accès. Pour les autres (TECHNICIAN, CLIENT_*),
// on exclut INTERNAL du résultat.
const FULL_VISIBILITY_ROLES = new Set(["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR"]);

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const orgIdParam = searchParams.get("orgId");
  if (q.length < 2) return NextResponse.json({ hits: [], groups: {} });

  const limit = Math.min(Number(searchParams.get("limit") ?? 40), 100);
  const tsq = q.split(/\s+/).filter(Boolean).map((w) => `${w}:*`).join(" & ");

  // --- Scoping org ---------------------------------------------------------
  // Staff : soit ?orgId= soit tout. Non-staff (CLIENT_*) : cloué à accessibles.
  const staff = isStaffRole(me.role);
  let orgScopeIds: string[] | null = null; // null = pas de contrainte
  if (orgIdParam) {
    // Valide que le user a accès à cette org.
    if (staff) {
      orgScopeIds = [orgIdParam];
    } else {
      const accessible = await getAccessibleOrgIds(me);
      if (!accessible || !accessible.includes(orgIdParam)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      orgScopeIds = [orgIdParam];
    }
  } else if (!staff) {
    const accessible = await getAccessibleOrgIds(me);
    if (!accessible || accessible.length === 0) {
      return NextResponse.json({ hits: [], groups: {}, total: 0 });
    }
    orgScopeIds = accessible;
  }

  const orgFilter = orgScopeIds
    ? Prisma.sql`AND organization_id IN (${Prisma.join(orgScopeIds)})`
    : Prisma.empty;

  // --- Filtre visibility ---------------------------------------------------
  // Pour non-admins MSP, on exclut INTERNAL (et PolicySubcategory INTERNAL_ONLY).
  const fullVis = FULL_VISIBILITY_ROLES.has(me.role);
  const visFilter = fullVis ? Prisma.empty : Prisma.sql`AND visibility <> 'INTERNAL'`;
  const policySubcatFilter = fullVis
    ? Prisma.empty
    : Prisma.sql`AND subcategory NOT IN ('SCRIPT', 'PRIVILEGED_ACCESS', 'KEEPASS')`;

  // Articles KB : si non-staff et orgScope défini, force scope. Sinon ok
  // pour staff d'interroger tout KB.
  const articlesOrgFilter = (() => {
    if (!staff && orgScopeIds) {
      return Prisma.sql`AND (organization_id IS NULL OR organization_id IN (${Prisma.join(orgScopeIds)}))`;
    }
    if (orgIdParam) {
      return Prisma.sql`AND (organization_id IS NULL OR organization_id = ${orgIdParam})`;
    }
    return Prisma.empty;
  })();

  const [parts, docs, software, changes, articles] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; title: string; summary: string | null; organization_id: string; rank: number }>>`
      SELECT id, title, summary, organization_id,
        ts_rank(search_vector, to_tsquery('french_unaccent', ${tsq}))::float AS rank
      FROM particularities
      WHERE search_vector @@ to_tsquery('french_unaccent', ${tsq})
        AND status = 'ACTIVE'
        ${visFilter}
        ${orgFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<Array<{ id: string; title: string; summary: string | null; organization_id: string; rank: number }>>`
      SELECT id, title, summary, organization_id,
        ts_rank(search_vector, to_tsquery('french_unaccent', ${tsq}))::float AS rank
      FROM policy_documents
      WHERE search_vector @@ to_tsquery('french_unaccent', ${tsq})
        AND status = 'ACTIVE'
        ${visFilter}
        ${policySubcatFilter}
        ${orgFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<Array<{ id: string; name: string; vendor: string | null; organization_id: string; rank: number }>>`
      SELECT id, name, vendor, organization_id,
        ts_rank(search_vector, to_tsquery('french_unaccent', ${tsq}))::float AS rank
      FROM software_instances
      WHERE search_vector @@ to_tsquery('french_unaccent', ${tsq})
        AND status = 'ACTIVE'
        ${visFilter}
        ${orgFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<Array<{ id: string; title: string; summary: string | null; organization_id: string; rank: number }>>`
      SELECT id, title, summary, organization_id,
        ts_rank(search_vector, to_tsquery('french_unaccent', ${tsq}))::float AS rank
      FROM changes
      WHERE search_vector @@ to_tsquery('french_unaccent', ${tsq})
        AND merged_into_id IS NULL
        AND status NOT IN ('REJECTED', 'ARCHIVED')
        ${visFilter}
        ${orgFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<Array<{ id: string; title: string; summary: string | null; organization_id: string | null; rank: number }>>`
      SELECT id, title, summary, organization_id,
        ts_rank(search_vector, websearch_to_tsquery('french_unaccent', ${q}))::float AS rank
      FROM articles
      WHERE search_vector @@ websearch_to_tsquery('french_unaccent', ${q})
        AND status = 'PUBLISHED'
        ${articlesOrgFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
  ]);

  const orgIds = new Set<string>();
  for (const r of [...parts, ...docs, ...software, ...changes, ...articles]) {
    if (r.organization_id) orgIds.add(r.organization_id);
  }
  const orgs = await prisma.organization.findMany({
    where: { id: { in: Array.from(orgIds) } },
    select: { id: true, name: true },
  });
  const orgName = new Map(orgs.map((o) => [o.id, o.name] as const));

  const hits: Hit[] = [
    ...parts.map((r) => ({
      type: "particularity" as const, id: r.id, title: r.title, excerpt: r.summary,
      orgId: r.organization_id, orgName: orgName.get(r.organization_id) ?? null,
      url: `/particularities/${r.id}`, rank: Number(r.rank),
    })),
    ...docs.map((r) => ({
      type: "policy_document" as const, id: r.id, title: r.title, excerpt: r.summary,
      orgId: r.organization_id, orgName: orgName.get(r.organization_id) ?? null,
      url: `/policies/documents/${r.id}`, rank: Number(r.rank),
    })),
    ...software.map((r) => ({
      type: "software" as const, id: r.id, title: r.name, excerpt: r.vendor,
      orgId: r.organization_id, orgName: orgName.get(r.organization_id) ?? null,
      url: `/software/${r.id}`, rank: Number(r.rank),
    })),
    ...changes.map((r) => ({
      type: "change" as const, id: r.id, title: r.title, excerpt: r.summary,
      orgId: r.organization_id, orgName: orgName.get(r.organization_id) ?? null,
      url: `/changes/${r.id}`, rank: Number(r.rank),
    })),
    ...articles.map((r) => ({
      type: "article" as const, id: r.id, title: r.title, excerpt: r.summary,
      orgId: r.organization_id, orgName: r.organization_id ? orgName.get(r.organization_id) ?? null : null,
      url: `/knowledge/${r.id}`, rank: Number(r.rank),
    })),
  ];
  hits.sort((a, b) => b.rank - a.rank);

  const groups: Record<string, Hit[]> = {
    particularity: hits.filter((h) => h.type === "particularity"),
    policy_document: hits.filter((h) => h.type === "policy_document"),
    software: hits.filter((h) => h.type === "software"),
    change: hits.filter((h) => h.type === "change"),
    article: hits.filter((h) => h.type === "article"),
  };

  return NextResponse.json({ hits, groups, total: hits.length });
}
