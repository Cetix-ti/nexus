// ============================================================================
// POST /api/v1/intelligence/kb-gaps/[categoryId]/draft
//
// Génère un brouillon d'article KB à partir des tickets échantillons du gap
// pour cette catégorie. Utilise gpt-4o-mini via POLICY_KB_GEN. Crée un
// Article status=DRAFT pré-rempli et retourne son id pour redirection.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_KB_GEN } from "@/lib/ai/orchestrator/policies";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { categoryId } = await params;

  const gap = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: "meta:kb_gaps",
        kind: "category",
        key: categoryId,
      },
    },
    select: { value: true },
  });
  if (!gap) return NextResponse.json({ error: "Gap not found" }, { status: 404 });

  const v = gap.value as {
    categoryPath?: string;
    categoryName?: string;
    sampleTicketIds?: string[];
  } | null;
  const sampleIds = Array.isArray(v?.sampleTicketIds) ? v!.sampleTicketIds : [];
  if (sampleIds.length === 0) {
    return NextResponse.json({ error: "No sample tickets" }, { status: 400 });
  }

  const sampleTickets = await prisma.ticket.findMany({
    where: { id: { in: sampleIds } },
    select: {
      id: true,
      subject: true,
      description: true,
    },
    take: 5,
  });
  if (sampleTickets.length === 0) {
    return NextResponse.json({ error: "Samples unavailable" }, { status: 400 });
  }

  const ticketsBlock = sampleTickets
    .map(
      (t, i) =>
        `TICKET ${i + 1}\nSujet : ${t.subject}\nDescription : ${(t.description ?? "").slice(0, 1000)}`,
    )
    .join("\n\n---\n\n");

  const system = `Tu rédiges un BROUILLON d'article KB GÉNÉRAL à partir de plusieurs tickets résolus d'une même catégorie. Le but : couvrir le type de problème, pas un ticket particulier. Un tech qui tombera sur un NOUVEAU ticket similaire pourra s'y référer.

Réponds en JSON strict :
{
  "title": "titre court, thématique (max 80 char)",
  "summary": "2 phrases résumant le problème générique et la solution type",
  "body": "article Markdown : ## Symptômes courants\\n## Causes probables\\n## Diagnostic (étapes)\\n## Résolution (étapes numérotées)\\n## Prévention",
  "tags": ["3 à 6 tags"],
  "suggestedVisibility": "internal" | "public"
}

Règles :
- JAMAIS de nom de client ou de personne.
- Résolution sous forme d'étapes numérotées avec verbes à l'infinitif.
- Si les tickets échantillons ne convergent pas assez → return title:"".`;

  const user = `Catégorie cible : ${v?.categoryPath ?? v?.categoryName ?? "(inconnue)"}

Tickets échantillons (tous résolus) :
${ticketsBlock}

Rédige l'article.`;

  const res = await runAiTask({
    policy: POLICY_KB_GEN,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: "summarization",
  });
  if (!res.ok || !res.content) {
    return NextResponse.json({ error: "LLM failed" }, { status: 502 });
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(res.content);
  } catch {
    const m = res.content.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        /* swallow */
      }
    }
  }
  if (!parsed) {
    return NextResponse.json({ error: "Invalid LLM output" }, { status: 502 });
  }
  const title = String(parsed.title ?? "").trim();
  const summary = String(parsed.summary ?? "").trim().slice(0, 500);
  const body = String(parsed.body ?? "").trim();
  if (!title || !body) {
    return NextResponse.json(
      { error: "Samples insufficient to draft" },
      { status: 422 },
    );
  }
  const tags = Array.isArray(parsed.tags)
    ? (parsed.tags as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim().slice(0, 40))
        .filter((t) => t.length > 0)
        .slice(0, 10)
    : [];
  // On ajoute systématiquement les tags techniques pour traçabilité.
  if (!tags.includes("auto-généré")) tags.push("auto-généré");
  if (!tags.includes("brouillon-ia")) tags.push("brouillon-ia");

  // Slug simple à partir du title. Le Article model le rend unique par org
  // via @@unique([organizationId, slug]) — ici organizationId=null (internal).
  const baseSlug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;

  const article = await prisma.article.create({
    data: {
      title,
      slug,
      summary,
      body,
      tags,
      categoryId,
      status: "DRAFT",
      isPublic: false,
      authorId: me.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ articleId: article.id });
}
