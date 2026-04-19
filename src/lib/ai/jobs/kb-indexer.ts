// ============================================================================
// KB INDEXER & AUTO-LINKING — embedde les articles KB publiés et propose
// automatiquement les articles pertinents à afficher sur un ticket.
//
// Flux :
//   1. Job `kb-indexer` : balaye les articles PUBLISHED, embedde ceux qui
//      ne sont pas indexés ou dont l'updatedAt est plus récent que l'embed.
//      Stocké dans AiPattern(scope="kb:embedding", kind="article", key=id).
//   2. Helper `suggestKbArticlesForTicket(ticketId, topN)` : calcule la
//      cosine entre l'embedding du ticket et tous les articles indexés,
//      retourne le top-N au-dessus du seuil.
//   3. API /api/v1/tickets/[id]/suggested-kb consomme ce helper pour le
//      widget "Articles KB pertinents" affiché sur la page ticket.
//
// Économique : Articles changent rarement (daily au plus) — on évite de
// ré-embedder. Scan toutes les 30 min.
// ============================================================================

import prisma from "@/lib/prisma";
import { embedText, cosineSim } from "@/lib/ai/embeddings";

const INDEX_BATCH = 20;
const SIM_THRESHOLD = 0.55;
const MIN_TEXT_CHARS = 50;

interface KbEmbedding {
  articleId: string;
  vec: number[];
  updatedAt: string;
  textHash: string;
}

/** Indexe (ou ré-indexe) les articles publiés qui ont changé. */
export async function indexKbArticles(): Promise<{
  scanned: number;
  embedded: number;
  skipped: number;
  failed: number;
}> {
  const stats = { scanned: 0, embedded: 0, skipped: 0, failed: 0 };

  // Charge tous les embeddings existants en une seule requête pour savoir
  // lesquels re-indexer. Petit volume (quelques centaines d'articles) OK.
  const existing = await prisma.aiPattern.findMany({
    where: { scope: "kb:embedding", kind: "article" },
    select: { key: true, value: true, lastUpdatedAt: true },
  });
  const existingById = new Map<string, { updatedAt: string; textHash: string }>();
  for (const e of existing) {
    const v = e.value as Partial<KbEmbedding> | null;
    if (v && typeof v.updatedAt === "string" && typeof v.textHash === "string") {
      existingById.set(e.key, { updatedAt: v.updatedAt, textHash: v.textHash });
    }
  }

  // Sélectionne les articles candidats — PUBLISHED only, pour ne pas
  // indexer les drafts WIP qui vont changer 5 fois.
  const articles = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      tags: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  stats.scanned = articles.length;

  const toIndex: typeof articles = [];
  for (const a of articles) {
    const text = buildIndexableText(a);
    if (text.length < MIN_TEXT_CHARS) {
      stats.skipped++;
      continue;
    }
    const hash = fastHash(text);
    const ex = existingById.get(a.id);
    if (ex && ex.textHash === hash) {
      stats.skipped++;
      continue;
    }
    toIndex.push(a);
    if (toIndex.length >= INDEX_BATCH) break;
  }

  for (const a of toIndex) {
    try {
      const text = buildIndexableText(a);
      const vec = await embedText(text);
      if (!vec) {
        stats.failed++;
        continue;
      }
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "kb:embedding",
            kind: "article",
            key: a.id,
          },
        },
        create: {
          scope: "kb:embedding",
          kind: "article",
          key: a.id,
          value: {
            articleId: a.id,
            vec,
            updatedAt: a.updatedAt.toISOString(),
            textHash: fastHash(text),
          } as never,
          sampleCount: 1,
          confidence: 1,
        },
        update: {
          value: {
            articleId: a.id,
            vec,
            updatedAt: a.updatedAt.toISOString(),
            textHash: fastHash(text),
          } as never,
        },
      });
      stats.embedded++;
    } catch (err) {
      console.warn(`[kb-indexer] embed failed for article ${a.id}:`, err);
      stats.failed++;
    }
  }

  // Nettoyage : articles supprimés / dépubliés → retire leurs embeddings.
  const currentIds = new Set(articles.map((a) => a.id));
  const orphans = Array.from(existingById.keys()).filter(
    (id) => !currentIds.has(id),
  );
  if (orphans.length > 0) {
    await prisma.aiPattern.deleteMany({
      where: {
        scope: "kb:embedding",
        kind: "article",
        key: { in: orphans },
      },
    });
  }

  return stats;
}

function buildIndexableText(a: {
  title: string;
  summary: string;
  body: string;
  tags: string[];
}): string {
  // On strip très grossièrement le HTML du body (TipTap) pour que
  // l'embedding se concentre sur le sens. On garde titre + summary en tête
  // car ils portent la charge sémantique la plus élevée.
  const bodyText = (a.body ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tagsLine = a.tags.length > 0 ? `Tags : ${a.tags.join(", ")}` : "";
  return [a.title, a.summary, tagsLine, bodyText]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
}

function fastHash(s: string): string {
  // djb2 stable — pas besoin de crypto-grade pour détecter un changement.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

// ---------------------------------------------------------------------------
// SUGGESTIONS — appelé à chaque ouverture de ticket via l'API.
//
// Stratégie :
//   1. Charge/calcule l'embedding du ticket.
//   2. Cosine vs tous les embeddings KB en mémoire (quelques centaines,
//      donc négligeable). Cache les embeddings 10 min pour éviter les
//      re-reads.
//   3. Si la catégorie du ticket matche celle d'un article, boost + 0.05.
// ---------------------------------------------------------------------------

interface KbCache {
  at: number;
  articles: Array<{ id: string; vec: number[]; categoryId: string | null }>;
}
let kbCache: KbCache | null = null;
const KB_CACHE_TTL_MS = 10 * 60_000;

export async function getKbEmbeddingsCached(): Promise<KbCache["articles"]> {
  if (kbCache && Date.now() - kbCache.at < KB_CACHE_TTL_MS) {
    return kbCache.articles;
  }
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "kb:embedding", kind: "article" },
    select: { key: true, value: true },
  });
  const ids = rows.map((r) => r.key);
  const articles =
    ids.length > 0
      ? await prisma.article.findMany({
          where: { id: { in: ids }, status: "PUBLISHED" },
          select: { id: true, categoryId: true },
        })
      : [];
  const catById = new Map(articles.map((a) => [a.id, a.categoryId ?? null]));

  const list: KbCache["articles"] = [];
  for (const r of rows) {
    const v = r.value as Partial<KbEmbedding> | null;
    if (!v || !Array.isArray(v.vec)) continue;
    list.push({
      id: r.key,
      vec: v.vec as number[],
      categoryId: catById.get(r.key) ?? null,
    });
  }
  kbCache = { at: Date.now(), articles: list };
  return list;
}

export async function suggestKbArticlesForTicket(
  ticketId: string,
  topN = 3,
): Promise<
  Array<{
    articleId: string;
    title: string;
    summary: string;
    similarity: number;
    sameCategory: boolean;
  }>
> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { categoryId: true, embedding: true, subject: true, description: true },
  });
  if (!ticket) return [];

  let vec: number[] | null =
    Array.isArray(ticket.embedding) && ticket.embedding.length > 0
      ? (ticket.embedding as number[])
      : null;

  if (!vec) {
    const txt = `${ticket.subject ?? ""}\n${ticket.description ?? ""}`.trim();
    if (txt.length < 10) return [];
    vec = await embedText(txt);
    if (!vec) return [];
  }

  const kb = await getKbEmbeddingsCached();
  if (kb.length === 0) return [];

  // Feedbacks explicites pour ce ticket : "bad" exclut, "good" booste.
  const feedbackRows = await prisma.aiPattern.findMany({
    where: {
      scope: "kb:feedback",
      kind: "pair",
      key: { startsWith: `${ticketId}|` },
    },
    select: { value: true },
  });
  const excludedArticleIds = new Set<string>();
  const boostedArticleIds = new Set<string>();
  for (const r of feedbackRows) {
    const v = r.value as { articleId?: string; verdict?: string } | null;
    if (!v?.articleId) continue;
    if (v.verdict === "bad") excludedArticleIds.add(v.articleId);
    else if (v.verdict === "good") boostedArticleIds.add(v.articleId);
  }

  const scored = kb
    .filter((a) => !excludedArticleIds.has(a.id))
    .map((a) => {
      const sim = cosineSim(vec!, a.vec);
      const sameCategory =
        ticket.categoryId != null && a.categoryId === ticket.categoryId;
      let boosted = sameCategory ? sim + 0.05 : sim;
      if (boostedArticleIds.has(a.id)) boosted *= 1.5;
      return { id: a.id, sim, boosted, sameCategory };
    });

  scored.sort((a, b) => b.boosted - a.boosted);
  const top = scored
    .filter((s) => s.boosted >= SIM_THRESHOLD)
    .slice(0, topN);
  if (top.length === 0) return [];

  const articles = await prisma.article.findMany({
    where: { id: { in: top.map((t) => t.id) } },
    select: { id: true, title: true, summary: true },
  });
  const byId = new Map(articles.map((a) => [a.id, a]));

  return top
    .map((t) => {
      const a = byId.get(t.id);
      if (!a) return null;
      return {
        articleId: a.id,
        title: a.title,
        summary: a.summary?.slice(0, 220) ?? "",
        similarity: t.sim,
        sameCategory: t.sameCategory,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
