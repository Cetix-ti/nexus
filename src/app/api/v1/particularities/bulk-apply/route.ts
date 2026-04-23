import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { runContentAssist } from "@/lib/ai/content-assist";
import { resolveVariables } from "@/lib/templates/sync";

/**
 * POST /api/v1/particularities/bulk-apply
 * Body: { templateId, toOrgIds: string[], variables?: Record, autoCategorize?: boolean }
 *
 * Crée une Particularity par organisation depuis le template. Si
 * autoCategorize=true, l'IA propose une catégorie à partir du contenu résolu
 * (utile quand le template n'en a pas, ou pour surcharger).
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const templateId = body?.templateId as string | undefined;
  const toOrgIds = Array.isArray(body?.toOrgIds) ? (body.toOrgIds as string[]) : [];
  const variables = (body?.variables ?? {}) as Record<string, string | number | boolean | null>;
  const autoCategorize = Boolean(body?.autoCategorize);

  if (!templateId || toOrgIds.length === 0) {
    return NextResponse.json({ error: "templateId et toOrgIds requis" }, { status: 400 });
  }

  const tpl = await prisma.particularityTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) return NextResponse.json({ error: "Template introuvable" }, { status: 404 });

  const categories = autoCategorize
    ? await prisma.particularityCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      })
    : [];
  const nameToId = new Map(categories.map((c) => [c.name, c.id] as const));

  const created: string[] = [];
  for (const orgId of toOrgIds) {
    const resolvedBody = resolveVariables(tpl.body, variables);
    const resolvedTitle = resolveVariables(tpl.title, variables);
    const resolvedSummary = tpl.summary ? resolveVariables(tpl.summary, variables) : null;

    let categoryId = tpl.categoryId;
    let aiSuggested = false;
    if (autoCategorize && categories.length > 0) {
      const ai = await runContentAssist({
        capability: "suggest_category",
        title: resolvedTitle,
        body: resolvedBody,
        summary: resolvedSummary ?? undefined,
        categoryHints: categories.map((c) => c.name),
        userId: me.id,
        organizationId: orgId,
      });
      const suggested = (ai.data as { categoryName?: string } | undefined)?.categoryName;
      if (suggested && nameToId.has(suggested)) {
        categoryId = nameToId.get(suggested)!;
        aiSuggested = true;
      }
    }

    const inst = await prisma.particularity.create({
      data: {
        organizationId: orgId,
        templateId: tpl.id,
        templateVersion: tpl.version,
        title: resolvedTitle,
        summary: resolvedSummary,
        body: resolvedBody,
        categoryId,
        tags: tpl.tags,
        resolvedVariables: variables as never,
        visibility: tpl.visibilityDefault,
        authorId: me.id,
        updatedByUserId: me.id,
        aiCategorySuggested: aiSuggested,
      },
    });
    await prisma.particularityVersion.create({
      data: {
        particularityId: inst.id,
        version: 1,
        snapshot: {
          title: inst.title,
          summary: inst.summary,
          body: inst.body,
          categoryId: inst.categoryId,
          tags: inst.tags,
          visibility: inst.visibility,
          resolvedVariables: inst.resolvedVariables,
        },
        authorId: me.id,
        changeNote: `Appliqué depuis le modèle "${tpl.title}" v${tpl.version}`,
      },
    });
    created.push(inst.id);
  }

  return NextResponse.json({ created, count: created.length });
}
