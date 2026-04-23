import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";
import type { ContentVisibility, ContentStatus } from "@prisma/client";

const VISIBILITY: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const STATUS: ContentStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const item = await prisma.particularity.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true, icon: true, color: true } },
      author: { select: { id: true, firstName: true, lastName: true } },
      updatedBy: { select: { id: true, firstName: true, lastName: true } },
      template: { select: { id: true, title: true, version: true } },
      versions: {
        orderBy: { version: "desc" },
        take: 20,
        include: { author: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, item.organizationId);
  if (!guard.ok) return guard.res;

  // Recalcul syncState à la lecture (template peut avoir avancé)
  if (item.templateId && item.template && item.syncState !== "DETACHED") {
    const expected = item.templateVersion === item.template.version ? "IN_SYNC" : "DRIFTED";
    if (expected !== item.syncState) {
      await prisma.particularity.update({ where: { id }, data: { syncState: expected } });
      item.syncState = expected;
    }
  }

  return NextResponse.json(item);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();

  const existing = await prisma.particularity.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, existing.organizationId);
  if (!guard.ok) return guard.res;

  const data: Record<string, unknown> = { updatedByUserId: me.id };
  const changed: string[] = [];

  if (typeof body.title === "string" && body.title.trim() && body.title !== existing.title) {
    data.title = body.title.trim(); changed.push("title");
  }
  if ("summary" in body && body.summary !== existing.summary) {
    data.summary = body.summary ?? null; changed.push("summary");
  }
  if (typeof body.body === "string" && body.body !== existing.body) {
    data.body = body.body; changed.push("body");
  }
  if ("categoryId" in body && body.categoryId !== existing.categoryId) {
    data.categoryId = body.categoryId || null; changed.push("category");
    data.aiCategorySuggested = false; // correction humaine
  }
  if (Array.isArray(body.tags)) {
    data.tags = body.tags.map((t: unknown) => String(t)).filter(Boolean); changed.push("tags");
  }
  if (body.visibility && VISIBILITY.includes(body.visibility) && body.visibility !== existing.visibility) {
    data.visibility = body.visibility; changed.push("visibility");
  }
  if (body.status && STATUS.includes(body.status) && body.status !== existing.status) {
    data.status = body.status; changed.push("status");
  }
  if ("resolvedVariables" in body) {
    data.resolvedVariables = body.resolvedVariables ?? null; changed.push("variables");
  }
  if (body.detachFromTemplate === true && existing.templateId) {
    data.syncState = "DETACHED"; changed.push("detach");
  }
  if (body.lastReviewed === true) {
    data.lastReviewedAt = new Date(); changed.push("review");
  }

  // Version bump + snapshot seulement si contenu éditorial modifié
  const editorialChanged = ["title", "summary", "body", "category", "tags", "variables"].some((k) =>
    changed.includes(k),
  );
  if (editorialChanged) {
    data.version = existing.version + 1;
  }

  const updated = await prisma.particularity.update({
    where: { id },
    data,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true, icon: true, color: true } },
      author: { select: { id: true, firstName: true, lastName: true } },
      updatedBy: { select: { id: true, firstName: true, lastName: true } },
      template: { select: { id: true, title: true, version: true } },
    },
  });

  if (editorialChanged) {
    await prisma.particularityVersion.create({
      data: {
        particularityId: id,
        version: updated.version,
        snapshot: {
          title: updated.title,
          summary: updated.summary,
          body: updated.body,
          categoryId: updated.categoryId,
          tags: updated.tags,
          visibility: updated.visibility,
          resolvedVariables: updated.resolvedVariables,
        },
        authorId: me.id,
        changeNote: body.changeNote ?? null,
      },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await prisma.particularity.findUnique({ where: { id }, select: { organizationId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, existing.organizationId);
  if (!guard.ok) return guard.res;
  await prisma.particularity.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
