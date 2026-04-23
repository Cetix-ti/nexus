import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, PolicySubcategory } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const SUBS: PolicySubcategory[] = ["GPO", "SCRIPT", "PWD_AD", "PWD_ENTRA", "PRIVILEGED_ACCESS", "M365_ROLES", "KEEPASS", "BACKUP_REPLICATION", "OTHER"];

// Sous-catégories dont la visibilité CLIENT_* est BANNIE (INTERNAL only).
// Règle dure côté backend — l'UI ne propose même pas l'option.
const INTERNAL_ONLY: PolicySubcategory[] = ["SCRIPT", "PRIVILEGED_ACCESS", "KEEPASS"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const subcategory = searchParams.get("subcategory") as PolicySubcategory | null;
  const where: Record<string, unknown> = {};
  if (orgId) where.organizationId = orgId;
  if (subcategory && SUBS.includes(subcategory)) where.subcategory = subcategory;
  const items = await prisma.policyDocument.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, icon: true, color: true } },
      template: { select: { id: true, title: true, schemaVersion: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const organizationId = String(body?.organizationId ?? "");
  const subcategory = body?.subcategory as PolicySubcategory;
  const title = String(body?.title ?? "").trim();
  if (!organizationId || !SUBS.includes(subcategory) || !title) {
    return NextResponse.json({ error: "organizationId, subcategory et title requis" }, { status: 400 });
  }
  let visibility: ContentVisibility = VIS.includes(body?.visibility) ? body.visibility : "INTERNAL";
  if (INTERNAL_ONLY.includes(subcategory)) visibility = "INTERNAL"; // forcé
  let templateSchemaVersion: number | null = null;
  if (body?.templateId) {
    const tpl = await prisma.policyDocumentTemplate.findUnique({ where: { id: body.templateId }, select: { schemaVersion: true } });
    templateSchemaVersion = tpl?.schemaVersion ?? null;
  }
  const created = await prisma.policyDocument.create({
    data: {
      organizationId,
      templateId: body?.templateId || null,
      templateSchemaVersion,
      subcategory,
      title,
      categoryId: body?.categoryId || null,
      summary: body?.summary || null,
      body: body?.body || "",
      structuredFields: body?.structuredFields ?? null,
      resolvedVariables: body?.resolvedVariables ?? null,
      tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
      visibility,
      authorId: me.id,
      updatedByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
