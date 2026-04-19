// ============================================================================
// PROMPT EVOLUTION — les prompts s'améliorent seuls en relisant les échecs.
//
// Mécanisme :
//   1. Pour chaque feature auditée, on charge les verdicts "disagree" / "partial"
//      des 14 derniers jours (min MIN_SIGNALS signaux pour éviter le bruit).
//   2. Un méta-prompt envoyé à gpt-4o-mini :
//        "Voici 15 cas où le modèle s'est trompé + le verdict du juge.
//         Quels ajouts/reformulations concrètes au PROMPT SYSTEM réduiraient
//         ces erreurs ?"
//      Sortie = JSON structuré : guidance_additions (règles), anti_examples.
//   3. Stocké dans AiPattern(scope="prompt:<feature>", kind="guidance", key="current").
//   4. Les features lisent cette guidance via getPromptGuidance(feature) et la
//      concatènent à leur system prompt sous un marqueur clair.
//
// Distinction avec ai-audit :
//   - ai-audit apprend des PATTERNS PONCTUELS (mot stop, mapping catégorie).
//   - prompt-evolution apprend des RÈGLES NARRATIVES (phrases à ajouter au
//     prompt pour changer le comportement général du modèle).
//
// Les deux se complètent : le premier corrige des cas discrets, le second
// recalibre le jugement global du modèle.
//
// Safety : la guidance est bornée à ~800 chars pour ne pas faire exploser
// les tokens. Re-généré tous les 2 jours — suffisant pour absorber les
// dernières erreurs sans drift trop rapide.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask, tryParseJson } from "@/lib/ai/orchestrator";
import { POLICY_AI_AUDIT } from "@/lib/ai/orchestrator/policies";

const FEATURES_TO_EVOLVE = ["triage", "category_suggest", "priority_suggest"];
const LOOKBACK_DAYS = 14;
const MIN_SIGNALS = 8;
const MAX_CASES = 15;
const MAX_GUIDANCE_CHARS = 800;

interface PromptGuidance {
  additions: string[];      // nouvelles règles à ajouter au prompt
  antiExamples: string[];   // exemples de ce qu'il NE faut PAS faire
  generatedAt: string;
  basedOnCases: number;
}

export async function runPromptEvolution(): Promise<{
  featuresProcessed: number;
  guidancesWritten: number;
  skipped: number;
}> {
  const stats = { featuresProcessed: 0, guidancesWritten: 0, skipped: 0 };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  for (const feature of FEATURES_TO_EVOLVE) {
    stats.featuresProcessed++;

    // Cas où le modèle local s'est trompé. Privilégie "disagree" sur "partial".
    const audits = await prisma.aiAuditResult.findMany({
      where: {
        feature,
        createdAt: { gte: since },
        verdict: { in: ["disagree", "partial"] },
        judgeConfidence: { gte: 0.6 },
      },
      select: {
        verdict: true,
        reasoning: true,
        suggestion: true,
        invocationId: true,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CASES * 2,
    });

    if (audits.length < MIN_SIGNALS) {
      stats.skipped++;
      continue;
    }

    // Recharge le contexte ticket des invocations pour enrichir le prompt du
    // méta-juge. Sans ça, il voit juste "reasoning" et ne comprend pas le cas.
    const invocationIds = audits.map((a) => a.invocationId);
    const invocations = await prisma.aiInvocation.findMany({
      where: { id: { in: invocationIds } },
      select: {
        id: true,
        ticketId: true,
        response: true,
      },
    });
    const invById = new Map(invocations.map((i) => [i.id, i]));

    const ticketIds = invocations
      .map((i) => i.ticketId)
      .filter((x): x is string => !!x);
    const tickets = ticketIds.length
      ? await prisma.ticket.findMany({
          where: { id: { in: ticketIds } },
          select: {
            id: true,
            subject: true,
            description: true,
            category: { select: { name: true } },
          },
        })
      : [];
    const ticketById = new Map(tickets.map((t) => [t.id, t]));

    const cases = audits
      .slice(0, MAX_CASES)
      .map((a) => {
        const inv = invById.get(a.invocationId);
        const tck = inv?.ticketId ? ticketById.get(inv.ticketId) : null;
        return {
          subject: tck?.subject ?? "(inconnu)",
          description: (tck?.description ?? "").slice(0, 400),
          currentCategory: tck?.category?.name ?? "(aucune)",
          modelResponse: (inv?.response ?? "").slice(0, 600),
          verdict: a.verdict,
          judgeReasoning: a.reasoning.slice(0, 400),
          judgeSuggestion: (a.suggestion ?? "").slice(0, 300),
        };
      })
      .filter((c) => c.subject !== "(inconnu)" || c.modelResponse.length > 0);

    if (cases.length < MIN_SIGNALS) {
      stats.skipped++;
      continue;
    }

    const guidance = await generateGuidance(feature, cases);
    if (!guidance) {
      stats.skipped++;
      continue;
    }

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: `prompt:${feature}`,
            kind: "guidance",
            key: "current",
          },
        },
        create: {
          scope: `prompt:${feature}`,
          kind: "guidance",
          key: "current",
          value: guidance as never,
          sampleCount: cases.length,
          confidence: Math.min(1, cases.length / 20),
        },
        update: {
          value: guidance as never,
          sampleCount: cases.length,
          confidence: Math.min(1, cases.length / 20),
        },
      });
      stats.guidancesWritten++;
      console.log(
        `[prompt-evolution] ${feature} : ${guidance.additions.length} règle(s) ajoutée(s), ${guidance.antiExamples.length} anti-exemple(s) (${cases.length} cas analysés)`,
      );
    } catch (err) {
      console.warn(`[prompt-evolution] upsert failed for ${feature}:`, err);
      stats.skipped++;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Méta-prompt — extrait des règles d'amélioration concrètes à partir des
// cas d'échec. Volontairement restreint en longueur pour ne pas polluer les
// prompts downstream.
// ---------------------------------------------------------------------------

async function generateGuidance(
  feature: string,
  cases: Array<{
    subject: string;
    description: string;
    currentCategory: string;
    modelResponse: string;
    verdict: string;
    judgeReasoning: string;
    judgeSuggestion: string;
  }>,
): Promise<PromptGuidance | null> {
  const system = `Tu es un ingénieur prompt expert. Un modèle IA local (gemma3) réalise la feature "${feature}" sur un MSP. Un juge plus intelligent (gpt-4o-mini) a identifié plusieurs cas où il s'est trompé.

Ta mission : écrire des RÈGLES CONCRÈTES ET COURTES à INJECTER dans le prompt system du modèle local pour éviter que ces erreurs se répètent.

Contraintes :
- 3 à 6 règles MAX. Chaque règle tient sur UNE ligne (≤ 140 chars).
- Parle en impératif direct ("N'associe JAMAIS X à Y si Z.").
- 0 à 3 anti-exemples MAX (cas spécifiques qu'il faut éviter textuellement).
- Total (règles + anti-exemples) ≤ 700 caractères.
- Écris en français, ton professionnel, zéro emoji.

Réponds EXCLUSIVEMENT en JSON :
{
  "additions": ["règle 1", "règle 2", ...],
  "antiExamples": ["ex1", "ex2"]
}`;

  const caseBlocks = cases
    .map((c, i) => {
      return `CAS ${i + 1} (verdict: ${c.verdict}) :
  Sujet : ${c.subject}
  Description : ${c.description}
  Catégorie actuelle : ${c.currentCategory}
  Réponse du modèle local : ${c.modelResponse}
  Raisonnement du juge : ${c.judgeReasoning}
  Suggestion du juge : ${c.judgeSuggestion}`;
    })
    .join("\n\n");

  const user = `Feature ciblée : ${feature}
Nombre de cas d'échec : ${cases.length}

${caseBlocks}

Écris les règles d'amélioration à injecter dans le prompt system.`;

  const res = await runAiTask({
    policy: POLICY_AI_AUDIT,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: "classification",
  });

  if (!res.ok || !res.content) return null;
  const parsed = tryParseJson<{
    additions?: unknown;
    antiExamples?: unknown;
  }>(res.content);
  if (!parsed) return null;

  const additions = Array.isArray(parsed.additions)
    ? parsed.additions
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((s) => s.slice(0, 180))
        .slice(0, 6)
    : [];
  const antiExamples = Array.isArray(parsed.antiExamples)
    ? parsed.antiExamples
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((s) => s.slice(0, 180))
        .slice(0, 3)
    : [];

  if (additions.length === 0 && antiExamples.length === 0) return null;

  // Borne globale — si le modèle a été trop verbeux malgré les contraintes,
  // on tronque en priorité les antiExamples puis les additions excédentaires.
  const total = additions.concat(antiExamples).join("\n").length;
  if (total > MAX_GUIDANCE_CHARS) {
    while (
      antiExamples.length > 0 &&
      additions.concat(antiExamples).join("\n").length > MAX_GUIDANCE_CHARS
    ) {
      antiExamples.pop();
    }
    while (
      additions.length > 2 &&
      additions.concat(antiExamples).join("\n").length > MAX_GUIDANCE_CHARS
    ) {
      additions.pop();
    }
  }

  return {
    additions,
    antiExamples,
    generatedAt: new Date().toISOString(),
    basedOnCases: cases.length,
  };
}

// ---------------------------------------------------------------------------
// Helper public — les features appellent ça pour récupérer la guidance
// courante et l'injecter dans leur prompt.
//
// Cache 10 min : la guidance change tous les 2 jours, aucun besoin de lire
// la DB à chaque invocation.
// ---------------------------------------------------------------------------

interface CachedGuidance {
  at: number;
  byFeature: Map<string, PromptGuidance | null>;
}
let guidanceCache: CachedGuidance = { at: 0, byFeature: new Map() };
const GUIDANCE_CACHE_TTL_MS = 10 * 60_000;

export async function getPromptGuidance(
  feature: string,
): Promise<PromptGuidance | null> {
  if (
    Date.now() - guidanceCache.at < GUIDANCE_CACHE_TTL_MS &&
    guidanceCache.byFeature.has(feature)
  ) {
    return guidanceCache.byFeature.get(feature) ?? null;
  }

  // Rebuild full cache pour toutes les features connues.
  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: { startsWith: "prompt:" },
      kind: "guidance",
      key: "current",
    },
    select: { scope: true, value: true },
  });

  // Filtre les guidances marquées "harmful" par le meta-learning — si la
  // guidance courante n'a PAS amélioré (ou a aggravé) les verdicts, on
  // l'ignore jusqu'à la prochaine régénération.
  const { isPatternHarmful } = await import("@/lib/ai/jobs/meta-learning");

  const next = new Map<string, PromptGuidance | null>();
  for (const r of rows) {
    const f = r.scope.replace(/^prompt:/, "");
    if (isPatternHarmful(r.value)) {
      next.set(f, null);
      continue;
    }
    const v = r.value as Partial<PromptGuidance> | null;
    if (
      v &&
      Array.isArray(v.additions) &&
      Array.isArray(v.antiExamples) &&
      typeof v.generatedAt === "string"
    ) {
      next.set(f, {
        additions: v.additions,
        antiExamples: v.antiExamples,
        generatedAt: v.generatedAt,
        basedOnCases: typeof v.basedOnCases === "number" ? v.basedOnCases : 0,
      });
    } else {
      next.set(f, null);
    }
  }
  // Pour les features non trouvées, on mémorise quand même null pour éviter
  // un re-query à chaque appel dans la fenêtre TTL.
  for (const f of FEATURES_TO_EVOLVE) {
    if (!next.has(f)) next.set(f, null);
  }
  guidanceCache = { at: Date.now(), byFeature: next };
  return next.get(feature) ?? null;
}

// ---------------------------------------------------------------------------
// Formatage pour injection dans un prompt system.
// Retourne une chaîne prête à concaténer, ou vide si aucune guidance.
// ---------------------------------------------------------------------------

export function formatGuidanceForPrompt(guidance: PromptGuidance | null): string {
  if (!guidance) return "";
  if (guidance.additions.length === 0 && guidance.antiExamples.length === 0)
    return "";
  const lines: string[] = [];
  lines.push(
    "",
    "# APPRENTISSAGE CONTINU — règles apprises récemment des erreurs passées :",
  );
  for (const a of guidance.additions) lines.push(`- ${a}`);
  if (guidance.antiExamples.length > 0) {
    lines.push("", "Anti-exemples à ne PAS reproduire :");
    for (const e of guidance.antiExamples) lines.push(`- ${e}`);
  }
  return lines.join("\n");
}
