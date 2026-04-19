// ============================================================================
// AI KB AUDIT — analyse globale de la base de connaissances.
//
// Entrée :
//   - arborescence complète (ArticleCategory tree) avec compteurs
//   - liste des articles (titre, résumé, tags, statut, stats d'usage)
//
// Sortie : rapport { summary, structureSuggestions, articleSuggestions }
//   - structureSuggestions : add/rename/rehome/merge pour les catégories
//   - articleSuggestions : rehome/rename/addTags/markStale/rewrite par article
//
// Le rapport ne mute JAMAIS la DB — l'UI expose chaque suggestion avec un
// bouton "Appliquer" / "Ignorer". L'admin reste en contrôle total.
//
// Scope : org NULL (= globale MSP) seulement, pour l'instant. Les KB
// scopées par client (orgId) sont plus rares et peuvent suivre.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_KB_AUDIT } from "@/lib/ai/orchestrator/policies";

export type KbStructureAction =
  | "add_category"
  | "rename_category"
  | "rehome_category"
  | "merge_categories"
  | "split_category";

export type KbArticleAction =
  | "rehome_article"
  | "rename_article"
  | "add_tags"
  | "mark_stale"
  | "needs_rewrite";

export interface KbStructureSuggestion {
  action: KbStructureAction;
  /** ID de la catégorie ciblée (présent sauf pour add_category). */
  categoryId?: string;
  /** Chemin courant — redondant mais utile à l'UI pour l'affichage. */
  path?: string;
  /** Pour rename/rehome/add : chemin cible. */
  proposedPath?: string;
  /** Pour merge : liste des IDs à fusionner. */
  categoryIds?: string[];
  /** Pour rehome : ID de la nouvelle catégorie parente (null = racine). */
  proposedParentId?: string | null;
  /** Pour rename_category : nouveau nom (pas le chemin complet). */
  proposedName?: string;
  reason: string;
}

export interface KbArticleSuggestion {
  action: KbArticleAction;
  articleId: string;
  articleTitle: string;
  /** Pour rehome : ID de la catégorie cible (doit exister déjà). */
  proposedCategoryId?: string;
  /** Pour rehome : chemin lisible de la catégorie cible (UI). */
  proposedCategoryPath?: string;
  /** Pour rename : nouveau titre proposé. */
  proposedTitle?: string;
  /** Pour add_tags : tags proposés. */
  proposedTags?: string[];
  reason: string;
}

export interface KbAuditReport {
  summary: string;
  structureSuggestions: KbStructureSuggestion[];
  articleSuggestions: KbArticleSuggestion[];
  stats: {
    totalCategories: number;
    totalArticles: number;
    orphanArticles: number;
    staleCandidates: number; // 0 views + published
  };
  generatedAt: string;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function auditKbTaxonomy(): Promise<KbAuditReport> {
  const cats = await prisma.articleCategory.findMany({
    where: { organizationId: null }, // scope global MSP
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      description: true,
      _count: { select: { articles: true } },
    },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
  });

  const byId = new Map(cats.map((c) => [c.id, c]));
  function fullPath(c: (typeof cats)[number]): string {
    const chain: string[] = [c.name];
    let cursor = c.parentId ? byId.get(c.parentId) : undefined;
    while (cursor) {
      chain.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return chain.join(" > ");
  }

  const articles = await prisma.article.findMany({
    where: { organizationId: null },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      body: true,
      tags: true,
      status: true,
      categoryId: true,
      viewCount: true,
      helpfulCount: true,
      notHelpfulCount: true,
      updatedAt: true,
      publishedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  // Stats rapides
  const orphanArticles = articles.filter((a) => a.categoryId == null).length;
  const now = Date.now();
  const STALE_DAYS = 180;
  const staleCandidates = articles.filter(
    (a) =>
      a.status === "PUBLISHED" &&
      a.viewCount === 0 &&
      a.publishedAt != null &&
      now - a.publishedAt.getTime() > STALE_DAYS * 24 * 3600 * 1000,
  ).length;

  const hierarchyText = cats.length
    ? cats
        .map(
          (c) =>
            `- [${c.id}] ${fullPath(c)} (${c._count.articles} articles)${c.description ? ` — ${c.description.slice(0, 100)}` : ""}`,
        )
        .join("\n")
    : "(aucune catégorie)";

  // Limite à 60 articles mais envoie BEAUCOUP plus de corps (600 chars) pour
  // que l'IA puisse juger la qualité rédactionnelle. C'est le tradeoff
  // principal : mieux vaut analyser 60 articles à fond que 120 en surface.
  // Si l'admin a plus de 60 articles, il peut relancer l'audit (on
  // échantillonne différemment la prochaine fois via orderBy).
  const MAX_ARTICLES = 60;
  const articleSample = articles.slice(0, MAX_ARTICLES);
  const articlesText = articleSample
    .map((a) => {
      const cat = a.categoryId ? byId.get(a.categoryId) : undefined;
      const catPath = cat ? fullPath(cat) : "(sans catégorie)";
      const bodyPreview = stripHtml(a.body).slice(0, 600);
      const bodyLen = stripHtml(a.body).length;
      const pubDate = a.publishedAt
        ? a.publishedAt.toISOString().slice(0, 10)
        : "—";
      return `### [${a.id}] "${a.title}"
Catégorie: ${catPath}
Statut: ${a.status} | Public: ? | Tags: [${a.tags.join(", ") || "AUCUN"}] | Vues: ${a.viewCount} (👍${a.helpfulCount}/👎${a.notHelpfulCount}) | Publié: ${pubDate} | Longueur corps: ${bodyLen} chars
Résumé: ${a.summary || "(AUCUN résumé)"}
Extrait corps: ${bodyPreview}${bodyLen > 600 ? "…" : ""}`;
    })
    .join("\n\n");

  const system = `Tu es un consultant EXIGEANT en architecture et rédaction de base de connaissances pour un MSP. Tu fais un audit CRITIQUE — l'objectif n'est PAS d'être gentil, c'est d'identifier TOUT ce qui cloche pour que l'admin puisse améliorer la KB.

Tu analyses la structure + le contenu textuel des articles (pas seulement leurs métadonnées).

CRITÈRES D'ÉVALUATION (applique-les AGRESSIVEMENT, pas passivement) :

STRUCTURE :
- Catégorie trop large (>15 articles) → propose split_category
- Deux catégories redondantes → merge_categories
- Catégorie mal nommée (vague, jargon, incohérente) → rename_category
- Catégorie mal placée dans l'arbo → rehome_category
- Domaine manquant évident (p.ex. beaucoup d'articles "sauvegarde" sans catégorie dédiée) → add_category

ARTICLES — sois sévère, signale tout :
- TITRE vague/mystérieux/peu searchable ("Procédure", "Note", "À faire") → rename_article
- TITRE avec fautes d'orthographe/grammaire → rename_article
- Article SANS résumé et corps >500 chars → needs_rewrite
- Corps RÉDIGÉ CROCHE : fautes visibles, phrases incohérentes, structure absente, listes non formatées, ton familier → needs_rewrite
- Corps TROP COURT (<300 chars) ou INCOMPLET (finit abruptement, procédure sans conclusion) → needs_rewrite
- Article SANS TAGS ou avec 0-1 tag → add_tags (2-4 tags pertinents)
- Article mal classé (ex: article sur Outlook dans catégorie "Réseau") → rehome_article
- PUBLISHED depuis 6+ mois avec 0 vue → mark_stale

QUOTAS CIBLES :
- structureSuggestions : 3-10 items (ne force pas si tout va bien, mais ne sois pas avare)
- articleSuggestions : 10-30 items. Si tu n'en trouves qu'une ou deux sur 60 articles, c'est probablement que tu n'as pas cherché assez fort. Chaque article bâclé DOIT être signalé.

RÈGLES TECHNIQUES :
- articleId DOIT être exactement l'ID fourni entre crochets [xxx] au début de chaque article
- categoryId (pour rename_category/rehome_category/merge_categories/split_category) DOIT être l'ID fourni en [xxx] dans la hiérarchie
- Pour rehome_article → proposedCategoryId DOIT pointer vers une catégorie EXISTANTE (ID fourni) OU reste vide si tu crées d'abord la catégorie dans structureSuggestions
- Pour rename_category : proposedName = nouveau nom SEUL (pas le chemin complet)
- proposedParentId pour rehome_category : ID parent, ou null pour déplacer à la racine
- Pour proposedTags : toujours en snake_case ou kebab-case, jamais plus de 4

Réponds EXCLUSIVEMENT en JSON strict (pas de markdown) :
{
  "summary": "2-3 phrases décrivant l'état réel de la KB — sois honnête, pas diplomatique",
  "structureSuggestions": [
    {
      "action": "add_category" | "rename_category" | "rehome_category" | "merge_categories" | "split_category",
      "categoryId": "id si action porte sur une cat existante",
      "categoryIds": ["id1","id2"],
      "path": "chemin actuel lisible",
      "proposedPath": "chemin proposé complet",
      "proposedName": "nouveau nom (rename seulement)",
      "proposedParentId": "id parent ou null (rehome seulement)",
      "reason": "pourquoi, en 1-2 phrases concrètes"
    }
  ],
  "articleSuggestions": [
    {
      "action": "rehome_article" | "rename_article" | "add_tags" | "mark_stale" | "needs_rewrite",
      "articleId": "cuid exact",
      "articleTitle": "titre actuel",
      "proposedCategoryId": "id cat cible (si rehome_article)",
      "proposedCategoryPath": "chemin lisible cat cible",
      "proposedTitle": "nouveau titre",
      "proposedTags": ["tag1","tag2"],
      "reason": "pourquoi"
    }
  ]
}`;

  const user = `# État actuel

## Hiérarchie (${cats.length} catégories)
${hierarchyText}

## Articles (${articles.length} au total${articles.length > MAX_ARTICLES ? `, ${MAX_ARTICLES} échantillonnés` : ""})
${articlesText}

## Signaux détectés
- Articles sans catégorie (orphelins) : ${orphanArticles}
- Articles publiés ≥${STALE_DAYS}j sans une seule vue : ${staleCandidates}

Produis ton audit.`;

  const result = await runAiTask({
    policy: POLICY_KB_AUDIT,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: "generation",
  });

  const emptyStats = {
    totalCategories: cats.length,
    totalArticles: articles.length,
    orphanArticles,
    staleCandidates,
  };

  if (!result.ok || !result.content) {
    return {
      summary: `Audit IA indisponible (${result.error?.reason ?? "erreur inconnue"}).`,
      structureSuggestions: [],
      articleSuggestions: [],
      stats: emptyStats,
      generatedAt: new Date().toISOString(),
    };
  }

  try {
    const cleaned = result.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const articleIds = new Set(articleSample.map((a) => a.id));

    const structureSuggestions: KbStructureSuggestion[] = Array.isArray(
      parsed.structureSuggestions,
    )
      ? parsed.structureSuggestions
          .filter(
            (s: Record<string, unknown>) =>
              typeof s.action === "string" && typeof s.reason === "string",
          )
          .slice(0, 10)
      : [];

    // Valide chaque articleSuggestion : articleId doit exister
    const articleSuggestions: KbArticleSuggestion[] = Array.isArray(
      parsed.articleSuggestions,
    )
      ? parsed.articleSuggestions
          .filter(
            (s: Record<string, unknown>) =>
              typeof s.action === "string" &&
              typeof s.articleId === "string" &&
              articleIds.has(s.articleId as string) &&
              typeof s.reason === "string",
          )
          .slice(0, 30)
      : [];

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      structureSuggestions,
      articleSuggestions,
      stats: emptyStats,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      summary: "Impossible de parser la réponse IA.",
      structureSuggestions: [],
      articleSuggestions: [],
      stats: emptyStats,
      generatedAt: new Date().toISOString(),
    };
  }
}
