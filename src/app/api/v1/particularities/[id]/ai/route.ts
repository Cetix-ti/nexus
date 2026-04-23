import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { runContentAssist, type ContentCapability } from "@/lib/ai/content-assist";

const CAPS: ContentCapability[] = [
  "correct",
  "rewrite",
  "restructure",
  "summarize",
  "suggest_category",
  "suggest_tags",
  "detect_missing",
  "extract_variables",
  "explain",
];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const capability = body?.capability as ContentCapability;
  if (!CAPS.includes(capability)) {
    return NextResponse.json({ error: "capability invalide" }, { status: 400 });
  }

  const p = await prisma.particularity.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      category: { select: { name: true } },
    },
  });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Pour suggest_category on envoie les catégories disponibles
  let categoryHints: string[] | undefined;
  if (capability === "suggest_category") {
    const cats = await prisma.particularityCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true },
    });
    categoryHints = cats.map((c) => c.name);
  }

  const result = await runContentAssist({
    capability,
    title: p.title,
    body: p.body,
    summary: p.summary ?? undefined,
    tags: p.tags,
    categoryHints,
    organizationId: p.organizationId,
    organizationName: p.organization.name,
    userId: me.id,
  });

  return NextResponse.json(result);
}
