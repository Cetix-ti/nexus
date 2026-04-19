// ============================================================================
// AI RESOLUTION NOTES — Phase 1 #4 du copilote.
//
// À la fermeture d'un ticket, l'IA lit l'historique complet et produit
// DEUX versions structurées :
//   - Note technique interne (cause, correctif, recommandation)
//   - Note client simplifiée (vulgarisée, rassurante)
//
// Retourne les deux versions — le tech décide laquelle publier et peut
// éditer avant d'envoyer. Pas d'envoi automatique au client : c'est une
// proposition affichée sur la fiche.
//
// Structure forcée (JSON) pour que les notes de résolution soient
// réutilisables par la KB auto-génération (Phase 1 #5) et les rapports.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_RESOLUTION_NOTES } from "@/lib/ai/orchestrator/policies";

export interface ResolutionNotes {
  /** Cause probable identifiée durant la résolution (phrase ou courte explication). */
  cause: string;
  /** Ce qui a été fait pour corriger (liste ordonnée d'actions). */
  correctif: string[];
  /** Recommandation préventive — si l'IA en voit une, sinon chaîne vide. */
  recommandationPreventive: string;
  /** Version technique complète pour la fiche (note interne). */
  noteInterne: string;
  /** Version client vulgarisée et rassurante. */
  resumeClient: string;
}

export async function generateResolutionNotes(
  ticketId: string,
): Promise<ResolutionNotes | null> {
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

    const system = `Tu es un technicien senior qui rédige une note de résolution professionnelle à la fermeture d'un ticket. Tu produis deux versions : technique (interne) et simplifiée (client).

Tu réponds EXCLUSIVEMENT en JSON strict, format :
{
  "cause": "cause probable identifiée, phrase claire",
  "correctif": ["action 1", "action 2", ...],
  "recommandationPreventive": "1 phrase sur comment éviter le problème à l'avenir — chaîne vide si pas pertinent",
  "noteInterne": "note technique complète en français, 3-6 phrases. Mentionne le diagnostic, les actions prises, les observations.",
  "resumeClient": "résumé vulgarisé pour le client en français, 2-4 phrases, rassurant et clair. Pas de jargon."
}

Règles :
- Fonde-toi UNIQUEMENT sur les notes fournies. Ne pas inventer de cause si l'historique ne la mentionne pas (dire "Cause exacte non identifiée").
- Ne pas mentionner les noms d'agents internes dans le résumé client.
- Format "correctif" : verbes à l'infinitif, concis ("Redémarrer le service", "Supprimer la file d'attente").`;

    const user = `Client : ${ticket.organization?.name ?? "—"}
Catégorie : ${ticket.category?.name ?? "—"}
Sujet : ${ticket.subject}

Description initiale :
${(ticket.description ?? "").slice(0, 1500)}

---

Historique complet (notes internes + échanges client) :
${notesText}`;

    const result = await runAiTask({
      policy: POLICY_RESOLUTION_NOTES,
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

    const cause = String(parsed.cause ?? "").trim();
    const correctif = Array.isArray(parsed.correctif)
      ? (parsed.correctif as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 10)
      : [];
    const recommandationPreventive = String(
      parsed.recommandationPreventive ?? "",
    ).trim();
    const noteInterne = String(parsed.noteInterne ?? "").trim();
    const resumeClient = String(parsed.resumeClient ?? "").trim();

    if (!noteInterne && !resumeClient) return null;

    return {
      cause,
      correctif,
      recommandationPreventive,
      noteInterne,
      resumeClient,
    };
  } catch (err) {
    console.warn(
      `[ai-resolution-notes] ticket ${ticketId} failed:`,
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
