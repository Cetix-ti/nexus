import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";
import type { ContentVisibility, ContentStatus, PolicySubcategory } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const STATUS: ContentStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];
const INTERNAL_ONLY: PolicySubcategory[] = ["SCRIPT", "PRIVILEGED_ACCESS", "KEEPASS"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.policyDocument.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, icon: true, color: true } },
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
  const existing = await prisma.policyDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, existing.organizationId);
  if (!guard.ok) return guard.res;

  const data: Record<string, unknown> = { updatedByUserId: me.id };
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if ("summary" in body) data.summary = body.summary || null;
  if (typeof body.body === "string") data.body = body.body;
  if ("structuredFields" in body) data.structuredFields = body.structuredFields ?? null;
  if ("categoryId" in body) data.categoryId = body.categoryId || null;
  if (Array.isArray(body.tags)) data.tags = body.tags.map(String);
  if (body.status && STATUS.includes(body.status)) data.status = body.status;
  if (body.visibility && VIS.includes(body.visibility)) {
    // Règle dure : INTERNAL_ONLY subcategories ne peuvent jamais sortir vers CLIENT_*
    if (INTERNAL_ONLY.includes(existing.subcategory) && body.visibility !== "INTERNAL") {
      return NextResponse.json({ error: "Cette sous-catégorie doit rester interne." }, { status: 400 });
    }
    data.visibility = body.visibility;
  }
  if (body.lastReviewed === true) data.lastReviewedAt = new Date();

  const updated = await prisma.policyDocument.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await prisma.policyDocument.findUnique({ where: { id }, select: { organizationId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, existing.organizationId);
  if (!guard.ok) return guard.res;
  await prisma.policyDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
