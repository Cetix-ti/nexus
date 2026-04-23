import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";
import { computeGpoName } from "@/lib/policies/gpo-naming";
import type { ContentVisibility, GpoScope, GpoInstanceStatus } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const SCOPES: GpoScope[] = ["COMPUTER", "USER", "MIXED"];
const STATUS: GpoInstanceStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "DEPLOYED", "ARCHIVED"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.gpoInstance.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      template: true,
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, item.organizationId);
  if (!guard.ok) return guard.res;
  return NextResponse.json(item);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const existing = await prisma.gpoInstance.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, existing.organizationId);
  if (!guard.ok) return guard.res;

  const data: Record<string, unknown> = { updatedByUserId: me.id };
  let nameStem = existing.nameStem;
  let scope: GpoScope = existing.scope;
  let nameOverride: string | null = existing.nameOverride;

  if (typeof body.nameStem === "string" && body.nameStem.trim()) { nameStem = body.nameStem.trim(); data.nameStem = nameStem; }
  if (body.scope && SCOPES.includes(body.scope)) { scope = body.scope; data.scope = scope; }
  if ("nameOverride" in body) { nameOverride = body.nameOverride || null; data.nameOverride = nameOverride; }
  if ("description" in body) data.description = body.description || null;
  if ("bodyOverride" in body) data.bodyOverride = body.bodyOverride || null;
  if ("resolvedVariables" in body) data.resolvedVariables = body.resolvedVariables ?? null;
  if ("dependencies" in body) data.dependencies = body.dependencies ?? null;
  if (Array.isArray(body.linkedScriptIds)) data.linkedScriptIds = body.linkedScriptIds.map(String);
  if (Array.isArray(body.linkedAssetIds)) data.linkedAssetIds = body.linkedAssetIds.map(String);
  if (body.visibility && VIS.includes(body.visibility)) data.visibility = body.visibility;
  if (body.status && STATUS.includes(body.status)) data.status = body.status;
  if (body.detachFromTemplate === true && existing.templateId) data.syncState = "DETACHED";
  if (body.realignToTemplate === true && existing.templateId) {
    const tpl = await prisma.gpoTemplate.findUnique({ where: { id: existing.templateId } });
    if (tpl) { data.templateSchemaVersion = tpl.schemaVersion; data.syncState = "IN_SYNC"; }
  }
  // Recalcule computed name si nom/scope/override changé
  data.computedName = computeGpoName({ scope, nameStem, nameOverride });

  const updated = await prisma.gpoInstance.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await prisma.gpoInstance.findUnique({ where: { id }, select: { organizationId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, existing.organizationId);
  if (!guard.ok) return guard.res;
  await prisma.gpoInstance.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
