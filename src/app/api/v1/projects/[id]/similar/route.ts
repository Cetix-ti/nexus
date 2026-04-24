// ============================================================================
// /api/v1/projects/[id]/similar — projets liés (manuels) + suggestions IA.
//
// GET  → { linked: [...projets liés], suggestions: [...projets proches] }
//   Les suggestions sont heuristiques pour l'instant (même organisation,
//   même type, mots-clés partagés dans le nom / la description). Pas encore
//   de vrais embeddings — ça viendra quand on branchera l'orchestrateur IA.
//
// POST { relatedProjectId } → crée un lien manuel.
// DELETE ?linkId=xxx        → supprime un lien.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

const STOPWORDS = new Set([
  "le", "la", "les", "de", "des", "du", "un", "une", "et", "ou", "pour",
  "avec", "sans", "dans", "sur", "par", "au", "aux", "en", "project", "projet",
  "the", "a", "an", "of", "to", "for", "with", "and", "or", "in", "on",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const self = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true, name: true, description: true, type: true,
      organizationId: true, isInternal: true,
    },
  });
  if (!self) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });

  // Liens manuels + IA existants.
  const links = await prisma.projectSimilarLink.findMany({
    where: { projectId: id },
    include: {
      relatedProject: {
        select: {
          id: true, code: true, name: true, status: true,
          organization: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Suggestions heuristiques : on prend tous les projets non-archivés qui
  // ne sont pas déjà liés, et on score par Jacard sur les tokens du nom +
  // description. On boost l'appartenance à la même organisation.
  const linkedIds = new Set(links.map((l) => l.relatedProjectId));
  linkedIds.add(id);

  // Feedback humain déjà donné sur des suggestions précédentes : "bad"
  // filtre la suggestion, "good" la remonte en tête.
  const feedbacks = await prisma.projectSimilarFeedback.findMany({
    where: { projectId: id },
    select: { suggestedProjectId: true, verdict: true },
  });
  const badIds = new Set(
    feedbacks.filter((f) => f.verdict === "bad").map((f) => f.suggestedProjectId),
  );
  const goodIds = new Set(
    feedbacks.filter((f) => f.verdict === "good").map((f) => f.suggestedProjectId),
  );
  for (const bid of badIds) linkedIds.add(bid); // exclut les "bad" de la liste candidate

  const candidates = await prisma.project.findMany({
    where: {
      id: { notIn: [...linkedIds] },
      isArchived: false,
      isInternal: self.isInternal,
    },
    select: {
      id: true, code: true, name: true, description: true, type: true, status: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
    take: 200,
  });

  const selfTokens = tokenize(`${self.name} ${self.description ?? ""}`);
  const scored = candidates
    .map((c) => {
      const cTokens = tokenize(`${c.name} ${c.description ?? ""}`);
      let score = jaccard(selfTokens, cTokens);
      if (c.organizationId === self.organizationId) score += 0.15;
      if (c.type === self.type) score += 0.05;
      // Boost "good" : signal humain fort. On ajoute 0.25 pour garantir
      // que la suggestion approuvée revienne en tête sans écraser le
      // signal textuel.
      if (goodIds.has(c.id)) score += 0.25;
      return { project: c, score };
    })
    .filter((s) => s.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return NextResponse.json({
    success: true,
    data: {
      linked: links.map((l) => ({
        id: l.id,
        source: l.source,
        createdAt: l.createdAt.toISOString(),
        project: {
          id: l.relatedProject.id,
          code: l.relatedProject.code,
          name: l.relatedProject.name,
          status: l.relatedProject.status,
          organizationName: l.relatedProject.organization.name,
        },
      })),
      suggestions: scored.map((s) => ({
        score: Math.round(s.score * 100) / 100,
        project: {
          id: s.project.id,
          code: s.project.code,
          name: s.project.name,
          status: s.project.status,
          organizationName: s.project.organization.name,
        },
      })),
    },
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.relatedProjectId) {
    return NextResponse.json({ error: "relatedProjectId requis" }, { status: 400 });
  }
  if (body.relatedProjectId === id) {
    return NextResponse.json({ error: "On ne peut pas lier un projet à lui-même." }, { status: 400 });
  }
  try {
    const link = await prisma.projectSimilarLink.create({
      data: {
        projectId: id,
        relatedProjectId: String(body.relatedProjectId),
        source: body.source === "ai" ? "ai" : "manual",
      },
    });
    return NextResponse.json({ success: true, data: link });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "Lien déjà existant." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const linkId = req.nextUrl.searchParams.get("linkId");
  if (!linkId) return NextResponse.json({ error: "linkId requis" }, { status: 400 });
  await prisma.projectSimilarLink.deleteMany({
    where: { id: linkId, projectId: id },
  });
  return NextResponse.json({ success: true });
}
