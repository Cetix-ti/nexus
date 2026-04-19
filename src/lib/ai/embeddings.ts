// ============================================================================
// EMBEDDINGS — vecteurs sémantiques pour les tickets.
//
// Chaque ticket se voit associer un vecteur 768d calculé par nomic-embed-text
// via Ollama. Ce vecteur capte le sens sémantique du sujet + description :
//   - "outlook ne fonctionne plus" et "courriels ne s'ouvrent pas" sont
//     proches même sans mot commun
//   - "backup SQL failed" et "Excel crashe" sont LOIN malgré "microsoft"
//
// La similarité est calculée par cosine entre vecteurs — O(d) par paire.
// Pour N=10k tickets, un matching full-scan = 10k × 768 = 7.6M ops/query,
// très rapide en mémoire (<50ms).
//
// On NE remplace PAS le scoring par tokens : on le FUSIONNE. Les deux
// signaux sont complémentaires — embeddings captent le sens, tokens
// captent la rareté / l'identité technique (CVE, hostnames).
// ============================================================================

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { OllamaProvider } from "@/lib/ai/orchestrator/providers/ollama";

const provider = new OllamaProvider();

/**
 * Vecteur d'embedding pour un texte. Renvoie null si Ollama indisponible
 * ou si le modèle n'est pas pull.
 */
export async function embedText(text: string): Promise<number[] | null> {
  return provider.embed(text);
}

/**
 * Cosine similarity entre deux vecteurs. Renvoie dans [-1, 1] — en pratique
 * [0, 1] pour des embeddings de texte (jamais vraiment négatifs). Plus
 * proche de 1 = plus similaire.
 */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Calcule et persiste l'embedding d'un ticket si absent ou périmé.
 * Idempotent — safe à appeler plusieurs fois.
 */
export async function ensureTicketEmbedding(ticketId: string): Promise<boolean> {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subject: true,
      description: true,
      embedding: true,
      embeddingModel: true,
      updatedAt: true,
      embeddingAt: true,
    },
  });
  if (!t) return false;

  const currentModel = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
  const hasFreshEmbedding =
    t.embedding != null &&
    t.embeddingModel === currentModel &&
    t.embeddingAt &&
    t.embeddingAt >= t.updatedAt;
  if (hasFreshEmbedding) return true;

  const text = `${t.subject ?? ""}\n\n${(t.description ?? "").slice(0, 4000)}`;
  const vec = await embedText(text);
  if (!vec) return false;

  await prisma.ticket.update({
    where: { id: t.id },
    data: {
      embedding: vec as never,
      embeddingAt: new Date(),
      embeddingModel: currentModel,
    },
  });
  return true;
}

/**
 * Backfill par lot — ne traite que les tickets SANS embedding ou périmés.
 * Appelé par le job `ticket-embeddings`.
 */
export async function backfillEmbeddings(
  limit = 50,
): Promise<{ scanned: number; embedded: number; failed: number }> {
  const currentModel = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

  // Trois cas à couvrir :
  //   1. Ticket JAMAIS embeddé (embedding=null)
  //   2. Embeddé avec un modèle différent (migration du modèle)
  //   3. ÉDITÉ après l'embedding (stale) — nouveau cas couvert ici pour
  //      que les changements de sujet/description invalident le vecteur.
  //      Avant cette correction, un ticket édité gardait son vecteur
  //      initial et pouvait matcher sur des tokens qui n'existent plus
  //      dans la version courante → faux positifs dans le widget.
  //
  // Prisma ne supporte pas la comparaison directe entre deux colonnes
  // dans un WHERE. On utilise une query SQL raw pour le cas 3.
  const orphanOrWrongModel = await prisma.ticket.findMany({
    where: {
      OR: [
        { embedding: { equals: Prisma.DbNull } },
        { embeddingModel: { not: currentModel } },
      ],
    },
    select: { id: true, subject: true, description: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Cas 3 : tickets embeddés avec le bon modèle mais dont l'updatedAt
  // dépasse l'embeddingAt. Raw query car Prisma pas capable de comparer
  // deux colonnes dans le même WHERE.
  const remaining = Math.max(0, limit - orphanOrWrongModel.length);
  const stale =
    remaining > 0
      ? await prisma.$queryRaw<
          Array<{ id: string; subject: string; description: string | null }>
        >`
          SELECT id, subject, description
          FROM tickets
          WHERE embedding IS NOT NULL
            AND embedding_model = ${currentModel}
            AND embedding_at IS NOT NULL
            AND updated_at > embedding_at + INTERVAL '5 minutes'
          ORDER BY updated_at DESC
          LIMIT ${remaining}
        `
      : [];

  // Merge + déduplication (par sécurité).
  const byId = new Map<
    string,
    { id: string; subject: string; description: string | null }
  >();
  for (const t of orphanOrWrongModel) byId.set(t.id, t);
  for (const t of stale) byId.set(t.id, t);
  const toEmbed = Array.from(byId.values()).slice(0, limit);

  let embedded = 0;
  let failed = 0;
  for (const t of toEmbed) {
    const text = `${t.subject ?? ""}\n\n${(t.description ?? "").slice(0, 4000)}`;
    const vec = await embedText(text);
    if (!vec) {
      failed++;
      continue;
    }
    try {
      await prisma.ticket.update({
        where: { id: t.id },
        data: {
          embedding: vec as never,
          embeddingAt: new Date(),
          embeddingModel: currentModel,
        },
      });
      embedded++;
    } catch {
      failed++;
    }
  }
  return { scanned: toEmbed.length, embedded, failed };
}

/**
 * Fetch les embeddings d'un sous-ensemble de tickets (par ids) en une
 * requête. Utilisé par la similarité sémantique qui hydrate les candidats
 * DB puis score en mémoire.
 */
export async function loadEmbeddings(
  ticketIds: string[],
): Promise<Map<string, number[]>> {
  if (ticketIds.length === 0) return new Map();
  const rows = await prisma.ticket.findMany({
    where: {
      id: { in: ticketIds },
      NOT: { embedding: { equals: Prisma.DbNull } },
    },
    select: { id: true, embedding: true },
  });
  const map = new Map<string, number[]>();
  for (const r of rows) {
    if (Array.isArray(r.embedding)) {
      map.set(r.id, r.embedding as number[]);
    }
  }
  return map;
}

/**
 * Recherche sémantique : trouve les tickets les plus proches d'un ticket
 * source par cosine sur les embeddings. Retourne les candidats dont la
 * similarité dépasse `minSim` (défaut 0.55), triés décroissant.
 *
 * Stratégie : on limite le scan à un sous-ensemble raisonnable (même org,
 * récemment actifs) pour éviter de charger 10k+ embeddings en mémoire.
 * Pour un MSP typique (100-500 tickets actifs/org), le cosine full-scan
 * termine en <20ms. Si besoin de plus de scale, migrer vers pgvector.
 */
export async function findSimilarTicketsByEmbedding(args: {
  ticketId: string;
  organizationId?: string;
  limit?: number;
  minSim?: number;
  /** Si true, ne scanne que les tickets résolus/fermés (réutilisation de
   *  connaissance). Défaut: false (inclut les tickets en cours — utile pour
   *  le copilote qui veut savoir "y a-t-il un ticket voisin en ce moment"). */
  resolvedOnly?: boolean;
  /** Fenêtre de lookback en jours. Défaut 365. */
  lookbackDays?: number;
}): Promise<Array<{ ticketId: string; similarity: number }>> {
  const limit = args.limit ?? 8;
  const minSim = args.minSim ?? 0.55;
  const lookbackDays = args.lookbackDays ?? 365;

  const source = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: { embedding: true },
  });
  if (!source || !Array.isArray(source.embedding) || source.embedding.length === 0) {
    return [];
  }
  const sourceVec = source.embedding as number[];

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const candidates = await prisma.ticket.findMany({
    where: {
      id: { not: args.ticketId },
      NOT: { embedding: { equals: Prisma.DbNull } },
      createdAt: { gte: since },
      ...(args.organizationId ? { organizationId: args.organizationId } : {}),
      ...(args.resolvedOnly
        ? { status: { in: ["RESOLVED", "CLOSED"] } }
        : { status: { notIn: ["CANCELLED"] } }),
    },
    select: { id: true, embedding: true },
    orderBy: { createdAt: "desc" },
    // Plafond de sécurité — au-delà le cosine full-scan devient coûteux.
    // On priorise les plus récents (ordonnés desc) car plus pertinents.
    take: 500,
  });

  const scored: Array<{ ticketId: string; similarity: number }> = [];
  for (const c of candidates) {
    if (!Array.isArray(c.embedding)) continue;
    const sim = cosineSim(sourceVec, c.embedding as number[]);
    if (sim >= minSim) scored.push({ ticketId: c.id, similarity: sim });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
}
