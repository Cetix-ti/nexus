import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { computeGpoName } from "@/lib/policies/gpo-naming";
import type { ContentVisibility, GpoScope } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const SCOPES: GpoScope[] = ["COMPUTER", "USER", "MIXED"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const status = searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (orgId) where.organizationId = orgId;
  if (status) where.status = status;
  const items = await prisma.gpoInstance.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      template: { select: { id: true, nameStem: true, schemaVersion: true, scope: true } },
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
  const nameStem = String(body?.nameStem ?? "").trim();
  const scope = body?.scope as GpoScope;
  if (!organizationId || !nameStem || !SCOPES.includes(scope)) {
    return NextResponse.json({ error: "organizationId, nameStem et scope requis" }, { status: 400 });
  }
  let templateSchemaVersion: number | null = null;
  if (body?.templateId) {
    const tpl = await prisma.gpoTemplate.findUnique({ where: { id: body.templateId }, select: { schemaVersion: true } });
    templateSchemaVersion = tpl?.schemaVersion ?? null;
  }
  const computed = computeGpoName({ scope, nameStem, nameOverride: body?.nameOverride });
  const created = await prisma.gpoInstance.create({
    data: {
      organizationId,
      templateId: body?.templateId || null,
      templateSchemaVersion,
      nameStem,
      nameOverride: body?.nameOverride || null,
      scope,
      computedName: computed,
      resolvedVariables: body?.resolvedVariables ?? null,
      description: body?.description || null,
      bodyOverride: body?.bodyOverride || null,
      dependencies: body?.dependencies ?? null,
      visibility: VIS.includes(body?.visibility) ? body.visibility : "INTERNAL",
      linkedScriptIds: Array.isArray(body?.linkedScriptIds) ? body.linkedScriptIds.map(String) : [],
      linkedAssetIds: Array.isArray(body?.linkedAssetIds) ? body.linkedAssetIds.map(String) : [],
      updatedByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
