// ============================================================================
// AI KB GENERATION — Phase 1 #5 du copilote Nexus.
//
// Transforme un ticket résolu en brouillon d'article de base de
// connaissances. Trigger manuel (bouton sur la fiche ticket) — pas
// automatique : tous les billets ne méritent pas un article. Le jugement
// humain "celui-ci vaut la peine" est lui-même un signal utile.
//
// Produit un article structuré avec sections standards (symptômes,
// contexte, cause, résolution, prévention) + suggestions de tags.
// Le résultat est un BROUILLON — un admin le revoit, l'édite, puis
// décide de le publier.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_KB_GEN } from "@/lib/ai/orchestrator/policies";

export interface KbArticleDraft {
  title: string;
  summary: string;
  /** Contenu principal au format Markdown léger (titres, listes, code).
   *  Sera converti côté UI en HTML TipTap lors de la création réelle
   *  de l'article. */
  body: string;
  tags: string[];
  /** Recommandation sur la visibilité : "internal" (Cetix only) ou
   *  "public" (accessible via portail client). Par défaut "internal"
   *  pour être prudent — l'admin peut promouvoir après revue. */
  suggestedVisibility: "internal" | "public";
}

export async function generateKbDraft(
  ticketId: string,
): Promise<KbArticleDraft | null> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        description: true,
        organization: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    if (!ticket) return null;

    const comments = await prisma.comment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
      select: { body: true, isInternal: true },
      take: 30,
    });

    const notesText =
      comments.length === 0
        ? "(aucune note)"
        : comments
            .map(
              (c) =>
                `[${c.isInternal ? "INTERNE" : "CLIENT"}] ${stripHtml(c.body).slice(0, 600)}`,
            )
            .join("\n---\n");

    const system = `Tu convertis un ticket résolu en BROUILLON d'article de base de connaissances technique. Réutilisable par d'autres techniciens sur un cas similaire. Tu réponds EXCLUSIVEMENT en JSON strict, format :

{
  "title": "titre court, descriptif, sans jargon inutile (max 80 char)",
  "summary": "1-2 phrases qui résument le problème et sa solution",
  "body": "article complet en Markdown : \\n## Symptômes\\n...\\n## Contexte\\n...\\n## Cause\\n...\\n## Résolution\\n... (liste d'étapes)\\n## Prévention\\n...",
  "tags": ["tag1", "tag2", ...],
  "suggestedVisibility": "internal" | "public"
}

Règles :
- L'article doit être UTILISABLE par un tech différent qui n'a pas vu ce ticket.
- Pas de noms de clients, pas de noms de personnes, pas de données privées.
- Résolution : format liste numérotée d'étapes concrètes, verbes à l'infinitif.
- Tags : 3-6 mots-clés pertinents pour la recherche (ex: "vpn", "forticlient", "outlook profile").
- Visibility : "public" SEULEMENT si le savoir est générique et sûr à diffuser. Sinon "internal".
- Si le ticket ne contient pas assez d'information pour un article utile (ex: résolution triviale, ou cause non identifiée), retourne {"title":"","summary":"","body":"","tags":[],"suggestedVisibility":"internal"} — un title vide signale "pas de draft pertinent".`;

    const user = `Catégorie : ${ticket.category?.name ?? "—"}
Sujet : ${ticket.subject}

Description initiale :
${(ticket.description ?? "").slice(0, 1500)}

---

Historique complet (notes internes + échanges client) :
${notesText}`;

    const result = await runAiTask({
      policy: POLICY_KB_GEN,
      context: { ticketId: ticket.id },
      taskKind: "summarization",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    const parsed = parseJson(result.content);
    if (!parsed) return null;

    const title = String(parsed.title ?? "").trim();
    if (!title) return null; // signal explicite "pas de draft pertinent"

    const summary = String(parsed.summary ?? "").trim().slice(0, 500);
    const body = String(parsed.body ?? "").trim().slice(0, 10_000);
    const tags = Array.isArray(parsed.tags)
      ? (parsed.tags as unknown[])
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().toLowerCase().slice(0, 40))
          .filter((t) => t.length > 0)
          .slice(0, 10)
      : [];
    const rawVis = String(parsed.suggestedVisibility ?? "internal").toLowerCase();
    const suggestedVisibility: "internal" | "public" =
      rawVis === "public" ? "public" : "internal";

    if (!body) return null;

    return { title, summary, body, tags, suggestedVisibility };
  } catch (err) {
    console.warn(
      `[ai-kb-gen] ticket ${ticketId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(raw);
    return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : null;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const o = JSON.parse(m[0]);
      return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
