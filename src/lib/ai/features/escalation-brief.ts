// ============================================================================
// AI ESCALATION BRIEF — #7 du spec.
//
// Prépare un document d'escalade propre quand un ticket doit être passé à
// un N2 / spécialiste / équipe externe. Évite que le nouvel assignee
// perde 30 min à comprendre ce qui a été essayé.
//
// Structure produite :
//   - contextSummary : de quoi il s'agit (2-3 phrases)
//   - stepsTried    : liste ordonnée des actions déjà tentées
//   - currentHypothesis : hypothèse actuelle de cause
//   - bestNextActions : 2-4 pistes concrètes recommandées pour le N2
//   - suggestedDestination : quel type de spécialiste
//   - logsToAttach : indices sur quoi joindre (logs, captures) si
//                    l'historique le mentionne
//   - urgencyRationale : justification de l'urgence si pertinent
//
// Rendu UI en drawer avec bouton "Copier en note interne" — le tech colle
// dans le composer et assigne à la personne cible.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_ESCALATION_BRIEF } from "@/lib/ai/orchestrator/policies";
import { getOrgContextFacts, formatFactsForPrompt } from "./org-context";

export interface EscalationBrief {
  contextSummary: string;
  stepsTried: string[];
  currentHypothesis: string;
  bestNextActions: string[];
  suggestedDestination: string;
  logsToAttach: string[];
  urgencyRationale: string;
  /** Brouillon complet en texte simple — prêt à être collé en note interne
   *  ou envoyé par courriel à l'équipe d'escalade. */
  brief: string;
}

export async function generateEscalationBrief(
  ticketId: string,
): Promise<EscalationBrief | null> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        createdAt: true,
        organizationId: true,
        category: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });
    if (!ticket) return null;

    const orgFacts = await getOrgContextFacts(ticket.organizationId, 10);

    const comments = await prisma.comment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
      select: {
        body: true,
        isInternal: true,
        createdAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
      take: 50,
    });

    const ageHours = Math.round(
      (Date.now() - ticket.createdAt.getTime()) / 3_600_000,
    );

    const notesText =
      comments.length === 0
        ? "(aucune note)"
        : comments
            .map(
              (c) =>
                `[${c.isInternal ? "INTERNE" : "CLIENT"}] (${c.author.firstName} ${c.author.lastName}, ${new Date(c.createdAt).toLocaleDateString("fr-CA")}) ${stripHtml(c.body).slice(0, 800)}`,
            )
            .join("\n---\n");

    const system = `Tu prépares un BRIEF D'ESCALADE pour un ticket MSP qui doit passer à un N2 / spécialiste / équipe externe. Le destinataire n'a PAS vu le ticket avant — ton objectif : qu'il comprenne la situation en 60 secondes.

Tu réponds EXCLUSIVEMENT en JSON strict :
{
  "contextSummary": "2-3 phrases qui résument le problème et l'état actuel",
  "stepsTried": ["action 1", "action 2", ...],
  "currentHypothesis": "hypothèse actuelle de cause (1-2 phrases). 'Non déterminée' si flou.",
  "bestNextActions": ["piste concrète 1", "piste concrète 2", ...],
  "suggestedDestination": "type de spécialiste adapté (ex: 'N2 réseau', 'Spécialiste M365', 'Support fournisseur Fortinet')",
  "logsToAttach": ["élément à joindre 1", ...],
  "urgencyRationale": "pourquoi c'est urgent si ça l'est, sinon '—'"
}

Règles :
- stepsTried : VERBES AU PASSÉ, ordonnés chronologiquement. Ex: "Redémarré le spooler", "Testé impression depuis 2 postes".
- Ne pas inclure les messages client dans stepsTried — seulement ce que les TECHS ont fait.
- bestNextActions : verbes à l'infinitif. Ex: "Vérifier les journaux du Print Server", "Contacter le support fournisseur".
- logsToAttach : déduis ce qui serait pertinent d'après ce qui est mentionné dans les notes. Ex: "journaux Event Viewer Print Service", "capture d'écran de l'erreur client".
- Si l'information n'est pas dans le ticket, ne l'invente PAS. Préfère un champ vide ou "Non documenté".`;

    const factsBlock = formatFactsForPrompt(orgFacts);
    const factsSection = factsBlock ? `\n\n---\n\n${factsBlock}` : "";

    const user = `Ticket #${ticket.number}
Client : ${ticket.organization?.name ?? "—"}
Type : ${ticket.type}
Priorité : ${ticket.priority}
Statut : ${ticket.status}
Catégorie : ${ticket.category?.name ?? "—"}
Âge : ${ageHours} h
Sujet : ${ticket.subject}

Description initiale :
${(ticket.description ?? "").slice(0, 1500)}

---

Historique complet des notes et échanges :
${notesText}${factsSection}`;

    const result = await runAiTask({
      policy: POLICY_ESCALATION_BRIEF,
      context: {
        ticketId: ticket.id,
        organizationId: ticket.organizationId,
      },
      taskKind: "summarization",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    const parsed = parseJson(result.content);
    if (!parsed) return null;

    const contextSummary = String(parsed.contextSummary ?? "").trim();
    const stepsTried = pickStringArray(parsed.stepsTried, 10);
    const currentHypothesis = String(parsed.currentHypothesis ?? "").trim();
    const bestNextActions = pickStringArray(parsed.bestNextActions, 6);
    const suggestedDestination = String(
      parsed.suggestedDestination ?? "",
    ).trim();
    const logsToAttach = pickStringArray(parsed.logsToAttach, 6);
    const urgencyRationale = String(parsed.urgencyRationale ?? "").trim();

    if (!contextSummary) return null;

    // Construction d'un brouillon textuel cohérent — format lisible pour
    // copier directement dans une note interne ou un courriel.
    const brief = buildBriefText({
      ticketNumber: ticket.number,
      orgName: ticket.organization?.name ?? "—",
      subject: ticket.subject,
      contextSummary,
      stepsTried,
      currentHypothesis,
      bestNextActions,
      suggestedDestination,
      logsToAttach,
      urgencyRationale,
    });

    return {
      contextSummary,
      stepsTried,
      currentHypothesis,
      bestNextActions,
      suggestedDestination,
      logsToAttach,
      urgencyRationale,
      brief,
    };
  } catch (err) {
    console.warn(
      `[ai-escalation-brief] ticket ${ticketId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function buildBriefText(args: {
  ticketNumber: number;
  orgName: string;
  subject: string;
  contextSummary: string;
  stepsTried: string[];
  currentHypothesis: string;
  bestNextActions: string[];
  suggestedDestination: string;
  logsToAttach: string[];
  urgencyRationale: string;
}): string {
  const lines: string[] = [];
  lines.push(`ESCALADE — Ticket #${args.ticketNumber} (${args.orgName})`);
  lines.push(`Sujet : ${args.subject}`);
  lines.push("");
  lines.push("CONTEXTE :");
  lines.push(args.contextSummary);
  lines.push("");
  if (args.stepsTried.length > 0) {
    lines.push("DÉJÀ TENTÉ :");
    args.stepsTried.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    lines.push("");
  }
  if (args.currentHypothesis && args.currentHypothesis.length > 1) {
    lines.push("HYPOTHÈSE ACTUELLE :");
    lines.push(args.currentHypothesis);
    lines.push("");
  }
  if (args.bestNextActions.length > 0) {
    lines.push("PISTES RECOMMANDÉES :");
    args.bestNextActions.forEach((a) => lines.push(`  - ${a}`));
    lines.push("");
  }
  if (args.logsToAttach.length > 0) {
    lines.push("À JOINDRE / CONSULTER :");
    args.logsToAttach.forEach((l) => lines.push(`  - ${l}`));
    lines.push("");
  }
  if (args.suggestedDestination) {
    lines.push(`DESTINATION SUGGÉRÉE : ${args.suggestedDestination}`);
  }
  if (args.urgencyRationale && args.urgencyRationale !== "—") {
    lines.push(`URGENCE : ${args.urgencyRationale}`);
  }
  return lines.join("\n");
}

function pickStringArray(x: unknown, max: number): string[] {
  if (!Array.isArray(x)) return [];
  return (x as unknown[])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().slice(0, 400))
    .filter((s) => s.length > 0)
    .slice(0, max);
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
