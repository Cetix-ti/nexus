// ============================================================================
// AI COPILOT CHAT — Q&A court dans le contexte d'un ticket.
//
// Objectif : répondre à une question libre du technicien avec tout le contexte
// pertinent injecté automatiquement — sujet/description/commentaires du ticket,
// tickets similaires résolus chez le même client, et les faits AiMemory
// validés de ce client.
//
// Pas de mémoire de conversation (volontairement single-shot) — pour ça il
// faudrait une table dédiée et du persistance. L'expérience visée ici :
// "j'ai une question rapide sur ce ticket" → réponse brève, actionnable,
// avec les tickets cités pour que le tech puisse creuser.
//
// Scrub obligatoire (PII/hostnames/clientNames) car la question peut contenir
// n'importe quoi, et le contexte inclut des données client.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_COPILOT_CHAT } from "@/lib/ai/orchestrator/policies";
import {
  getOrgContextFacts,
  formatFactsForPrompt,
} from "@/lib/ai/features/org-context";
import {
  ensureTicketEmbedding,
  findSimilarTicketsByEmbedding,
} from "@/lib/ai/embeddings";
import { suggestKbArticlesForTicket } from "@/lib/ai/jobs/kb-indexer";

export interface CopilotAnswer {
  answer: string;
  citedTickets: Array<{ id: string; number: number }>;
  citedArticles: Array<{ id: string; title: string; similarity: number }>;
  /** ID de l'invocation AI — exposé à l'UI pour `recordHumanAction` via
   *  le composant FeedbackButtons. Indispensable pour fermer la boucle
   *  d'apprentissage (jobs copilot_chat-feedback-learner futur). */
  invocationId?: string;
}

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function askCopilot(args: {
  ticketId: string;
  question: string;
}): Promise<CopilotAnswer | null> {
  const question = args.question.trim();
  if (!question || question.length > 2000) return null;

  const ticket = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: {
      id: true,
      number: true,
      subject: true,
      description: true,
      organizationId: true,
      organization: { select: { name: true } },
      category: { select: { name: true, id: true } },
      comments: {
        orderBy: { createdAt: "desc" },
        select: { body: true, isInternal: true, createdAt: true },
        take: 10,
      },
    },
  });
  if (!ticket) return null;

  // S'assure que l'embedding du ticket est à jour — requis pour le RAG
  // vectoriel ci-dessous. Best-effort : si Ollama est down, on fallback
  // sur le scoring lexical uniquement.
  await ensureTicketEmbedding(ticket.id).catch(() => false);

  // --- RAG VECTORIEL : recherche sémantique (hybride lexical + embedding) -
  // Étage 1 : candidats lexicaux (même client + tokens du sujet OU même
  // catégorie). Étage 2 : candidats sémantiques (cosine sur embeddings).
  // Fusion déduplication par id, score = similarité sémantique si présente,
  // sinon 0.5 pour un candidat purement lexical (signal plus faible).
  const stop = new Set(["avec", "sans", "pour", "this", "that", "from"]);
  const tokens = (ticket.subject ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôöùûüÿç\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stop.has(t))
    .slice(0, 5);

  const [lexicalRaw, semanticMatches] = await Promise.all([
    tokens.length > 0
      ? prisma.ticket.findMany({
          where: {
            organizationId: ticket.organizationId,
            id: { not: ticket.id },
            status: { notIn: ["CANCELLED"] },
            OR: [
              ...(ticket.category?.id
                ? [{ categoryId: ticket.category.id }]
                : []),
              ...tokens.map((t) => ({
                subject: { contains: t, mode: "insensitive" as const },
              })),
            ],
          },
          select: {
            id: true,
            number: true,
            subject: true,
            status: true,
            createdAt: true,
            closedAt: true,
            resolvedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
      : Promise.resolve([]),
    findSimilarTicketsByEmbedding({
      ticketId: ticket.id,
      organizationId: ticket.organizationId,
      limit: 8,
      minSim: 0.6,
    }).catch(() => []),
  ]);

  // Hydrate les matches sémantiques qui ne sont pas déjà dans le lot lexical.
  const lexicalIds = new Set(lexicalRaw.map((t) => t.id));
  const semanticOnlyIds = semanticMatches
    .map((m) => m.ticketId)
    .filter((id) => !lexicalIds.has(id));
  const semanticTickets =
    semanticOnlyIds.length > 0
      ? await prisma.ticket.findMany({
          where: { id: { in: semanticOnlyIds } },
          select: {
            id: true,
            number: true,
            subject: true,
            status: true,
            createdAt: true,
            closedAt: true,
            resolvedAt: true,
          },
        })
      : [];

  // Score map pour tri final (semantic score > lexical-only fallback).
  const semanticSimById = new Map(
    semanticMatches.map((m) => [m.ticketId, m.similarity]),
  );
  const mergedRaw = [...lexicalRaw, ...semanticTickets];
  // Ordre : similarité sémantique d'abord, puis date desc pour les purement
  // lexicaux (pas d'embedding). Cap à 10 candidats passés au LLM.
  mergedRaw.sort((a, b) => {
    const sa = semanticSimById.get(a.id) ?? 0;
    const sb = semanticSimById.get(b.id) ?? 0;
    if (sa !== sb) return sb - sa;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const similarRaw = mergedRaw.slice(0, 10);

  const similar = await Promise.all(
    similarRaw.map(async (t) => {
      const lastNote = await prisma.comment.findFirst({
        where: { ticketId: t.id, isInternal: true },
        orderBy: { createdAt: "desc" },
        select: { body: true },
      });
      return {
        number: t.number,
        subject: t.subject,
        status: t.status,
        resolutionNotes: lastNote?.body ?? null,
        createdAt: t.createdAt,
        closedAt: t.closedAt ?? t.resolvedAt,
        semanticSim: semanticSimById.get(t.id) ?? null,
      };
    }),
  );

  // --- KB articles pertinents (RAG sur la base de connaissances) ---------
  // Réutilise l'index KB existant (AiPattern scope=kb:embedding). Top 3
  // articles au-dessus du seuil (0.55 par défaut dans suggestKbArticlesForTicket).
  const kbSuggestions = await suggestKbArticlesForTicket(ticket.id, 3).catch(
    () => [] as Array<{
      articleId: string;
      title: string;
      summary: string;
      similarity: number;
      sameCategory: boolean;
    }>,
  );

  const facts = await getOrgContextFacts(ticket.organizationId, 10);
  const factsBlock = formatFactsForPrompt(facts);

  const commentsBlock = ticket.comments
    .map(
      (c) =>
        `[${c.isInternal ? "INTERNE" : "public"}, ${c.createdAt.toISOString().slice(0, 10)}] ${stripHtml(c.body).slice(0, 400)}`,
    )
    .join("\n");

  const similarBlock =
    similar.length === 0
      ? "(aucun ticket similaire trouvé)"
      : similar
          .map((s) => {
            const isResolved =
              s.status === "RESOLVED" || s.status === "CLOSED";
            const stateLabel = isResolved
              ? `RÉSOLU le ${s.closedAt ? s.closedAt.toISOString().slice(0, 10) : "?"}`
              : `EN COURS (${s.status})`;
            const simTag =
              s.semanticSim != null
                ? ` (sim=${(s.semanticSim * 100).toFixed(0)}%)`
                : "";
            return `#${s.number} [${stateLabel}]${simTag} — ${s.subject}\n   ${
              isResolved
                ? `Résolution : ${stripHtml(s.resolutionNotes).slice(0, 300) || "(non documentée)"}`
                : `Créé le ${s.createdAt.toISOString().slice(0, 10)} — pas encore résolu`
            }`;
          })
          .join("\n\n");

  const kbBlock =
    kbSuggestions.length === 0
      ? ""
      : `\n## Articles KB pertinents (recherche sémantique)\n${kbSuggestions
          .map(
            (k) =>
              `KB#${k.articleId.slice(0, 8)} — ${k.title} (sim=${(k.similarity * 100).toFixed(0)}%${k.sameCategory ? ", même catégorie" : ""})\n   ${k.summary || "(pas de résumé)"}`,
          )
          .join("\n\n")}\n`;

  const system = `Tu es Nexus, un copilote pour technicien MSP. Tu réponds à une question posée dans le contexte d'un ticket en cours.

Ta mission :
- Répondre DIRECTEMENT à la question, en 3-8 phrases maximum.
- Si la question porte sur des tickets similaires, examine la section "Tickets similaires" : elle contient à la fois des tickets RÉSOLUS et EN COURS. Cite tout ce qui est pertinent, peu importe le statut.
- Si la section "Articles KB pertinents" contient des articles, cite-les par leur titre quand ils apportent une procédure/connaissance utile à la réponse. Référence-les avec leur ID (ex: KB#abc12345).
- Si tu cites un ticket, utilise son numéro exact (#1234) tel que fourni dans le contexte.
- Si le nom du client apparaît dans ta réponse, utilise EXACTEMENT le nom fourni dans le bloc "Client :" du contexte. N'invente JAMAIS un nom de ville, d'entreprise ou de lieu.
- Si tu ne sais pas ou si le contexte est insuffisant, dis-le clairement.
- Priorise l'actionnable : étapes concrètes, commandes, vérifications.
- Ne JAMAIS inventer d'information technique ou de commande.

Tu réponds EXCLUSIVEMENT en JSON strict :
{
  "answer": "texte de la réponse, formaté en markdown léger (listes, gras)",
  "citedTicketNumbers": [1234, 5678],
  "citedArticleIds": ["abc12345", "def67890"]
}

citedTicketNumbers : inclut UNIQUEMENT les numéros que tu as réellement référencés dans answer.
citedArticleIds : inclut UNIQUEMENT les IDs courts (8 caractères) des articles KB que tu as réellement cités.`;

  const user = `# Ticket courant #${ticket.number}
Client : ${ticket.organization?.name ?? "(inconnu)"}
Sujet : ${ticket.subject}
Catégorie : ${ticket.category?.name ?? "(non catégorisé)"}
Description : ${stripHtml(ticket.description).slice(0, 800)}

## Historique du ticket
${commentsBlock || "(aucun commentaire)"}

## Tickets similaires chez ce client (ouverts ET résolus)
${similarBlock}
${kbBlock}
${factsBlock ? `## Contexte client\n${factsBlock}\n` : ""}

## Question du technicien
${question}

IMPORTANT : Si tu cites le nom du client dans ta réponse, utilise EXACTEMENT le nom fourni ci-dessus ("${ticket.organization?.name ?? "(inconnu)"}"). Ne le remplace jamais par autre chose.`;

  const result = await runAiTask({
    policy: POLICY_COPILOT_CHAT,
    context: {
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
    },
    taskKind: "chat",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  if (!result.ok || !result.content) return null;
  const parsed = parseJson(result.content);
  if (!parsed || typeof parsed.answer !== "string") return null;

  const answer = parsed.answer.trim();
  if (!answer) return null;

  const citedRaw = Array.isArray(parsed.citedTicketNumbers)
    ? parsed.citedTicketNumbers
    : [];
  const citedNumbers = citedRaw
    .filter((n: unknown): n is number => typeof n === "number" && Number.isFinite(n))
    .slice(0, 10);

  // Résolution number → id pour que l'UI puisse linker correctement. On
  // limite au même organizationId que le ticket courant — pas question que
  // le copilote cite un ticket d'un autre client.
  const citedTickets =
    citedNumbers.length > 0
      ? (
          await prisma.ticket.findMany({
            where: {
              number: { in: citedNumbers },
              organizationId: ticket.organizationId,
            },
            select: { id: true, number: true },
          })
        ).map((t) => ({ id: t.id, number: t.number }))
      : [];

  // Résolution des IDs courts KB (8 chars) vers les articles réels pour
  // que l'UI affiche des liens cliquables. On matche par prefix sur
  // le cuid — robuste tant qu'on reste sur les articles suggérés ci-dessus.
  const citedShortIds = Array.isArray(parsed.citedArticleIds)
    ? (parsed.citedArticleIds as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.length >= 4,
      )
    : [];
  const citedArticles = citedShortIds
    .map((shortId) => {
      const match = kbSuggestions.find((k) =>
        k.articleId.startsWith(shortId),
      );
      return match
        ? {
            id: match.articleId,
            title: match.title,
            similarity: match.similarity,
          }
        : null;
    })
    .filter((x): x is { id: string; title: string; similarity: number } => x !== null)
    // Dédup sur id au cas où l'LLM cite deux fois le même prefix.
    .filter(
      (v, i, arr) => arr.findIndex((u) => u.id === v.id) === i,
    );
  // Si l'LLM n'a pas cité explicitement mais que des articles étaient
  // clairement top-similarité (>0.75), on les expose quand même à l'UI —
  // le tech pourra les consulter même si le texte de la réponse ne les
  // mentionne pas. Sans doublonner ceux déjà cités.
  for (const k of kbSuggestions) {
    if (
      k.similarity >= 0.75 &&
      !citedArticles.some((c) => c.id === k.articleId)
    ) {
      citedArticles.push({
        id: k.articleId,
        title: k.title,
        similarity: k.similarity,
      });
    }
  }

  return {
    answer,
    citedTickets,
    citedArticles,
    invocationId: result.invocationId,
  };
}

function parseJson(s: string): Record<string, unknown> | null {
  try {
    const cleaned = s
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const obj = JSON.parse(cleaned);
    return typeof obj === "object" && obj !== null ? obj : null;
  } catch {
    return null;
  }
}
