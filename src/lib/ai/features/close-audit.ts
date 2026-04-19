// ============================================================================
// AI CLOSE AUDIT — Phase 2.
//
// Avant de fermer ou résoudre un ticket, propose une vérification qualité
// non bloquante :
//   - Score de complétude (0-1) de la documentation
//   - Warnings (ex: "notes trop vagues", "aucune confirmation client")
//   - Champs manquants qu'on devrait documenter
//   - Suggestions de tâches de SUIVI PRÉVENTIF (ex: vérifier dans 48h,
//     analyse cause racine, mise à jour de documentation)
//   - Verdict global : "ready" / "needs_improvement"
//
// L'agent peut fermer quand même — c'est un "friendly nudge" copilote,
// jamais un bloqueur. L'objectif : améliorer progressivement la qualité
// de documentation sans alourdir le travail.
//
// Le résultat est loggé dans AiInvocation. Si l'agent ferme malgré le
// warning, on peut analyser plus tard les patterns de fermeture rapide
// vs fermeture documentée pour du coaching ciblé.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_CLOSE_AUDIT } from "@/lib/ai/orchestrator/policies";

export interface CloseAuditResult {
  /** 0.0 = documentation vide, 1.0 = exemplaire. */
  readinessScore: number;
  /** Verdict global, aide l'UI à décider quelle couleur afficher. */
  verdict: "ready" | "needs_improvement" | "blocked";
  warnings: string[];
  /** Champs qu'on recommande de remplir ou compléter avant fermeture. */
  missingFields: string[];
  /** Tâches de suivi préventif à proposer après résolution. */
  followUpSuggestions: Array<{
    title: string;
    rationale: string;
    priority: "low" | "medium" | "high";
    dueInDays?: number;
  }>;
}

export async function auditTicketForClose(
  ticketId: string,
): Promise<CloseAuditResult | null> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        description: true,
        category: { select: { name: true } },
        type: true,
      },
    });
    if (!ticket) return null;

    const comments = await prisma.comment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
      select: { body: true, isInternal: true, createdAt: true },
      take: 40,
    });

    const internalCount = comments.filter((c) => c.isInternal).length;
    const clientCount = comments.filter((c) => !c.isInternal).length;

    const notesText =
      comments.length === 0
        ? "(aucune note)"
        : comments
            .map(
              (c) =>
                `[${c.isInternal ? "INTERNE" : "CLIENT"}] ${stripHtml(c.body).slice(0, 600)}`,
            )
            .join("\n---\n");

    const system = `Tu audites un ticket MSP AVANT sa fermeture, comme un responsable qualité bienveillant. Tu identifies ce qui manque pour que ce ticket soit réutilisable dans le futur (par un autre tech qui rencontrerait le même problème) et tu proposes des suivis préventifs utiles.

Tu réponds EXCLUSIVEMENT en JSON strict, format :
{
  "readinessScore": 0.0-1.0,
  "verdict": "ready" | "needs_improvement" | "blocked",
  "warnings": ["avertissement 1", ...],
  "missingFields": ["champ 1", ...],
  "followUpSuggestions": [
    { "title": "titre de la tâche", "rationale": "pourquoi", "priority": "low|medium|high", "dueInDays": 2 }
  ]
}

Règles :
- readinessScore : 1.0 si cause + correctif + validation client documentés. 0.3 si "réglé" sans contexte.
- verdict "ready" ≥ 0.7 ; "needs_improvement" 0.3-0.7 ; "blocked" < 0.3 (documentation quasi absente).
- warnings : max 4 points concrets et actionnables. Pas de généralités.
- missingFields : éléments qui aideraient la réutilisation future. Ex: "cause racine", "test de validation", "configuration appliquée".
- followUpSuggestions : 0-3 tâches de SUIVI PRÉVENTIF quand pertinent :
    · "Vérifier les logs dans 48h" si intervention risquée
    · "Analyse cause racine" si corrigé temporairement
    · "Documenter la procédure" si première fois ce type d'intervention
    · "Mettre à jour la KB" si savoir réutilisable
  Ne PAS proposer de suivi juste pour en proposer — chaîne vide acceptable.
- Reste pragmatique. Un ticket trivial ("réinitialiser mot de passe") n'a pas besoin d'autant de docs qu'un incident majeur.`;

    const user = `Type : ${ticket.type}
Catégorie : ${ticket.category?.name ?? "—"}
Sujet : ${ticket.subject}

Description initiale :
${(ticket.description ?? "").slice(0, 1500)}

---

Historique complet (${internalCount} note(s) interne(s), ${clientCount} échange(s) client) :
${notesText}`;

    const result = await runAiTask({
      policy: POLICY_CLOSE_AUDIT,
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

    const rawScore = Number(parsed.readinessScore);
    const readinessScore = Number.isFinite(rawScore)
      ? Math.max(0, Math.min(1, rawScore))
      : 0.5;
    const verdictRaw = String(parsed.verdict ?? "").toLowerCase();
    const verdict: CloseAuditResult["verdict"] =
      verdictRaw === "ready" ||
      verdictRaw === "needs_improvement" ||
      verdictRaw === "blocked"
        ? (verdictRaw as CloseAuditResult["verdict"])
        : readinessScore >= 0.7
          ? "ready"
          : readinessScore >= 0.3
            ? "needs_improvement"
            : "blocked";

    const warnings = Array.isArray(parsed.warnings)
      ? (parsed.warnings as unknown[])
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.slice(0, 200))
          .slice(0, 6)
      : [];
    const missingFields = Array.isArray(parsed.missingFields)
      ? (parsed.missingFields as unknown[])
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.slice(0, 100))
          .slice(0, 6)
      : [];

    const followUpSuggestions = Array.isArray(parsed.followUpSuggestions)
      ? (parsed.followUpSuggestions as unknown[])
          .map((item) => {
            const o = item as Record<string, unknown>;
            const title = String(o.title ?? "").trim();
            if (!title) return null;
            const rawPriority = String(o.priority ?? "medium").toLowerCase();
            const priority: "low" | "medium" | "high" =
              rawPriority === "low" || rawPriority === "high"
                ? (rawPriority as "low" | "high")
                : "medium";
            const dueInDaysNum = Number(o.dueInDays);
            const dueInDays =
              Number.isFinite(dueInDaysNum) && dueInDaysNum >= 0
                ? Math.min(Math.round(dueInDaysNum), 60)
                : undefined;
            return {
              title: title.slice(0, 160),
              rationale: String(o.rationale ?? "").slice(0, 300),
              priority,
              dueInDays,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .slice(0, 5)
      : [];

    return {
      readinessScore,
      verdict,
      warnings,
      missingFields,
      followUpSuggestions,
    };
  } catch (err) {
    console.warn(
      `[ai-close-audit] ticket ${ticketId} failed:`,
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
