// ============================================================================
// TICKET SUMMARY — Génère une description courte (1-2 phrases) d'un ticket
// pour les livrables clients (rapport mensuel) quand le sujet seul n'est pas
// assez descriptif.
//
// Seuil de confiance ÉLEVÉ : on ne renvoie un résumé QUE si l'IA est très
// sûre. Mieux vaut pas de résumé qu'un résumé inventé qui finit dans un
// document remis au client.
// ============================================================================

import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_TICKET_SUMMARY } from "@/lib/ai/orchestrator/policies";
import prisma from "@/lib/prisma";

export interface TicketSummaryResult {
  /** Résumé court (1-2 phrases). null si confiance insuffisante. */
  summary: string | null;
  /** Confiance brute renvoyée par l'IA (0-1). */
  confidence: number;
}

/** Seuil minimum pour afficher dans un livrable client. */
const MIN_CONFIDENCE = 0.8;

/** Limite de caractères du résumé final. ~2 lignes max dans le PDF. */
const MAX_SUMMARY_CHARS = 240;

/**
 * Génère un résumé court d'un ticket à partir de son sujet, sa description
 * et ses 3 derniers commentaires publics. Renvoie `summary: null` si la
 * confiance est sous {@link MIN_CONFIDENCE}.
 *
 * Ne throw jamais — toute erreur (clé manquante, JSON invalide, modèle hors
 * ligne) résulte en `summary: null` pour ne pas casser la génération du
 * rapport.
 */
export async function generateTicketSummary(
  ticketId: string,
): Promise<TicketSummaryResult> {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      subject: true,
      description: true,
      comments: {
        where: { isInternal: false },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { body: true },
      },
    },
  });
  if (!t) return { summary: null, confidence: 0 };

  const commentsText = t.comments
    .map((c) => c.body.trim())
    .filter((b) => b.length > 0)
    .reverse()
    .join("\n---\n");

  const userContent = [
    `Sujet: ${t.subject}`,
    `Description: ${(t.description || "").slice(0, 1500) || "(aucune)"}`,
    commentsText
      ? `Derniers commentaires publics:\n${commentsText.slice(0, 1500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const result = await runAiTask({
      policy: POLICY_TICKET_SUMMARY,
      taskKind: "generation",
      messages: [
        {
          role: "system",
          content: `Tu rédiges un résumé COURT (1 à 2 phrases, ${MAX_SUMMARY_CHARS} caractères max) d'un ticket de support IT, destiné à apparaître dans un rapport mensuel remis au CLIENT.

Règles ABSOLUES :
1. Le résumé doit clarifier ce qui a été demandé/résolu, sans répéter mot pour mot le sujet.
2. Reste factuel : aucune spéculation, aucune cause non documentée. Si l'info manque, baisse la confiance.
3. Ton professionnel et neutre. Pas de jargon technique inutile pour le client.
4. Pas d'emoji, pas de markdown, pas de noms propres techniques (mots de passe, clés, IP internes).
5. Confiance ÉLEVÉE (>= 0.8) UNIQUEMENT si le sujet + description sont clairs et que ton résumé apporte une vraie clarification. Sinon mets une confiance basse — un résumé absent est préférable à un résumé inventé.
6. Réponds en français.

Retourne UNIQUEMENT du JSON valide (sans markdown, sans backticks) :
{
  "summary": "Phrase 1. Phrase 2.",
  "confidence": 0.0
}`,
        },
        { role: "user", content: userContent },
      ],
    });
    if (!result.ok || !result.content) return { summary: null, confidence: 0 };

    const cleaned = result.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as {
      summary?: unknown;
      confidence?: unknown;
    };

    const rawSummary =
      typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;

    if (!rawSummary || confidence < MIN_CONFIDENCE) {
      return { summary: null, confidence };
    }
    const summary =
      rawSummary.length > MAX_SUMMARY_CHARS
        ? rawSummary.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd() + "…"
        : rawSummary;
    return { summary, confidence };
  } catch {
    return { summary: null, confidence: 0 };
  }
}

/**
 * Génère et persiste le résumé sur le Ticket si pas déjà présent.
 * Best-effort : toute erreur est silencieuse pour ne pas bloquer la
 * génération du rapport mensuel.
 */
export async function ensureTicketSummary(ticketId: string): Promise<{
  summary: string | null;
  confidence: number;
}> {
  const existing = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      aiSummary: true,
      aiSummaryConfidence: true,
    },
  });
  if (existing?.aiSummary && (existing.aiSummaryConfidence ?? 0) >= MIN_CONFIDENCE) {
    return {
      summary: existing.aiSummary,
      confidence: existing.aiSummaryConfidence ?? 0,
    };
  }

  const result = await generateTicketSummary(ticketId);

  try {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        aiSummary: result.summary,
        aiSummaryConfidence: result.confidence,
        aiSummaryGeneratedAt: new Date(),
      },
    });
  } catch {
    // Persist est best-effort — un échec ne doit pas casser la génération.
  }

  return result;
}
