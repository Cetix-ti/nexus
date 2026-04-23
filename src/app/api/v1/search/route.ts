// Recherche fédérée — query unique sur particularities, policy_documents,
// software_instances, changes, articles (KB existant) avec respect visibility.
// Retour groupé par type.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
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

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const orgId = searchParams.get("orgId");
  if (q.length < 2) return NextResponse.json({ hits: [], groups: {} });

  const limit = Math.min(Number(searchParams.get("limit") ?? 40), 100);
  // tsquery prefix-friendly : remplace espaces par & et ajoute :*
  const tsq = q.split(/\s+/).filter(Boolean).map((w) => `${w}:*`).join(" & ");
  const orgFilter = orgId ? Prisma.sql`AND organization_id = ${orgId}` : Prisma.empty;

  const [parts, docs, software, changes, articles] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; title: string; summary: string | null; organization_id: string; rank: number }>>`
      SELECT id, title, summary, organization_id,
        ts_rank(search_vector, to_tsquery('french_unaccent', ${tsq})) AS rank
      FROM particularities
      WHERE search_vector @@ to_tsquery('french_unaccent', ${tsq})
        AND status = 'ACTIVE'
        ${orgFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<Array<{ id: string; title: string; summary: string | null; organization_id: string; rank: number }>>`
      SELECT id, title, summary, organization_id,
        ts_rank(search_vector, to_tsquery('french_unaccent', ${tsq})) AS rank
      FROM policy_documents
      WHERE search_vector @@ to_tsquery('french_unaccent', ${tsq})
        AND status = 'ACTIVE'
        ${orgFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<Array<{ id: string; name: string; vendor: string | null; organization_id: string; rank: number }>>`
      SELECT id, name, vendor, organization_id,
        ts_rank(search_vector, to_tsquery('french_unaccent', ${tsq})) AS rank
      FROM software_instances
      WHERE search_vector @@ to_tsquery('french_unaccent', ${tsq})
        AND status = 'ACTIVE'
        ${orgFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<Array<{ id: string; title: string; summary: string | null; organization_id: string; rank: number }>>`
      SELECT id, title, summary, organization_id,
        ts_rank(search_vector, to_tsquery('french_unaccent', ${tsq})) AS rank
      FROM changes
      WHERE search_vector @@ to_tsquery('french_unaccent', ${tsq})
        AND merged_into_id IS NULL
        AND status NOT IN ('REJECTED', 'ARCHIVED')
        ${orgFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<Array<{ id: string; title: string; summary: string | null; organization_id: string | null; rank: number }>>`
      SELECT id, title, summary, organization_id,
        ts_rank(search_vector, websearch_to_tsquery('french_unaccent', ${q})) AS rank
      FROM articles
      WHERE search_vector @@ websearch_to_tsquery('french_unaccent', ${q})
        AND status = 'PUBLISHED'
      ORDER BY rank DESC
      LIMIT ${limit}
    `,
  ]);

  // Enrichir avec les noms d'organisation (lookup unique)
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
