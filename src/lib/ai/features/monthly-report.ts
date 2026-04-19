// ============================================================================
// AI MONTHLY REPORT — Phase 3 #11.
//
// Génère un rapport exécutif mensuel CLIENT à partir des signaux opérationnels.
// Ton rassurant, structuré, prêt à être envoyé au décideur (gestionnaire IT,
// DG) sans édition lourde. Pas du reporting opérationnel interne (c'est
// risk-analysis).
//
// Structure imposée :
//   - Résumé exécutif (2-3 phrases)
//   - Faits saillants (chiffres clés)
//   - Tendances observées
//   - Actions accomplies par Cetix
//   - Recommandations pour le mois prochain
//   - Points à discuter en rencontre (le cas échéant)
//
// L'agent édite ensuite avant envoi. Sortie markdown → convertible en PDF.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_MONTHLY_REPORT } from "@/lib/ai/orchestrator/policies";
import { collectOrgSignals } from "./signals";

export interface MonthlyReport {
  organizationId: string;
  organizationName: string;
  periodStart: string; // ISO YYYY-MM-DD
  periodEnd: string;
  executiveSummary: string;
  keyFacts: string[];
  trends: string[];
  completedActions: string[];
  recommendations: string[];
  discussionPoints: string[];
  /** Markdown complet pour export / PDF. */
  markdown: string;
  generatedAt: string;
  /**
   * Sanity check anti-hallucination : liste des nombres cités par l'IA dans
   * keyFacts qui ne correspondent à AUCUNE valeur présente dans les signaux
   * opérationnels. Chaque entrée = une mention numérique à double-checker
   * avant envoi au client. Vide = aucun écart détecté (tous les chiffres
   * cités sont corroborés par la DB).
   */
  unverifiedNumbers: Array<{ keyFactIndex: number; fact: string; suspects: number[] }>;
}

export async function generateMonthlyReport(args: {
  organizationId: string;
  /** Mois cible — défaut = mois précédent complet. */
  year?: number;
  month?: number; // 1-12
}): Promise<MonthlyReport | null> {
  try {
    const now = new Date();
    // Par défaut : mois précédent complet (le plus utile — on rapporte
    // sur un mois clos, pas un mois en cours).
    const defaultDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = args.year ?? defaultDate.getFullYear();
    const month = args.month ?? defaultDate.getMonth() + 1;

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);
    const daysInPeriod =
      (periodEnd.getTime() - periodStart.getTime()) / 86_400_000;

    const signals = await collectOrgSignals({
      organizationId: args.organizationId,
      sinceDays: Math.ceil(daysInPeriod),
    });
    if (!signals) return null;

    // Recollecte la liste des tickets fermés dans la période pour
    // alimenter "actions accomplies".
    const closedTickets = await prisma.ticket.findMany({
      where: {
        organizationId: args.organizationId,
        closedAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        subject: true,
        type: true,
        category: { select: { name: true } },
      },
      orderBy: { closedAt: "desc" },
      take: 20,
    });

    const monthNameFr = periodStart.toLocaleDateString("fr-CA", {
      month: "long",
      year: "numeric",
    });

    const system = `Tu rédiges un RAPPORT MENSUEL CLIENT pour un décideur (gestionnaire IT, DG). Ton rassurant, factuel, professionnel — pas technique. Pas de jargon sans explication. Pas de promesse non tenable.

Tu réponds EXCLUSIVEMENT en JSON strict, format :
{
  "executiveSummary": "2-3 phrases qui disent 'ça s'est passé comment ce mois-ci' en termes compréhensibles",
  "keyFacts": ["fait chiffré 1", "fait chiffré 2", ...],
  "trends": ["tendance observée 1", "tendance observée 2", ...],
  "completedActions": ["ce qu'on a fait pour eux 1", ...],
  "recommendations": ["recommandation priorisée 1", ...],
  "discussionPoints": ["point à aborder en rencontre 1", ...]
}

Règles :
- executiveSummary : si peu d'activité → le dire positivement ("mois calme, systèmes stables").
- keyFacts : 3-5 chiffres tirés des stats, présentés simplement ("12 demandes traitées, délai moyen 4h").
- trends : 2-4 observations sur l'évolution — préciser la direction (hausse/baisse/stable).
- completedActions : 3-6 accomplissements concrets du mois (résolutions marquantes, projets livrés, prévention réalisée). Utilise les tickets fermés listés.
- recommendations : 2-4 suggestions pour le prochain mois. Pragmatiques, pas vendeuses.
- discussionPoints : si rien à discuter, tableau vide. Sinon 1-3 sujets pour la prochaine rencontre.
- NE PAS inclure de noms de personnes, endpoints ou tickets précis. Rester au niveau agrégé et générique.`;

    const user = `Client : ${signals.organizationName}
Période : ${monthNameFr} (${signals.sinceDays} jours)

=== SIGNAUX OPÉRATIONNELS ===
Tickets totaux : ${signals.tickets.total} (tendance ${formatTrend(signals.tickets.trendVsPrevious)})
  • Résolus : ${signals.tickets.total - signals.tickets.stillOpen}
  • Encore ouverts : ${signals.tickets.stillOpen}
  • Délai moyen : ${signals.tickets.avgResolutionHours ?? "—"} h
  • SLA respectés : ${signals.tickets.total - signals.tickets.slaBreached}/${signals.tickets.total}
Répartition par catégorie : ${signals.tickets.byCategory
      .map((c) => `${c.name}:${c.count}`)
      .join(", ")}

Monitoring : ${signals.monitoring.total} alertes (${signals.monitoring.unresolved} non résolues)
Sécurité : ${signals.security.total} incidents détectés
Sauvegardes : ${signals.backups.success}/${signals.backups.total} succès (${signals.backups.failed} échecs, ${signals.backups.warning} avertissements)
Parc : ${signals.assets.total} actifs, ${signals.assets.warrantyExpired} garanties expirées, ${signals.assets.warrantyExpiringSoon} qui expirent dans 90j

=== TICKETS FERMÉS CE MOIS (contexte pour "actions accomplies") ===
${
  closedTickets.length === 0
    ? "(aucun)"
    : closedTickets
        .map(
          (t, i) =>
            `${i + 1}. [${t.category?.name ?? "—"}] ${t.subject.slice(0, 100)}`,
        )
        .join("\n")
}

=== CONNAISSANCE ACCUMULÉE ===
${
  signals.extractedFacts.length === 0
    ? "(pas de faits extraits)"
    : signals.extractedFacts
        .slice(0, 10)
        .map((f) => `[${f.kind}${f.verified ? "" : ", non vérifié"}] ${f.content}`)
        .join("\n")
}`;

    const result = await runAiTask({
      policy: POLICY_MONTHLY_REPORT,
      context: { organizationId: signals.organizationId },
      taskKind: "generation",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    const parsed = parseJson(result.content);
    if (!parsed) return null;

    const executiveSummary = String(parsed.executiveSummary ?? "").trim();
    const keyFacts = pickStringArray(parsed.keyFacts, 8);
    const trends = pickStringArray(parsed.trends, 6);
    const completedActions = pickStringArray(parsed.completedActions, 8);
    const recommendations = pickStringArray(parsed.recommendations, 6);
    const discussionPoints = pickStringArray(parsed.discussionPoints, 5);

    if (!executiveSummary) return null;

    const markdown = buildMarkdown({
      orgName: signals.organizationName,
      monthNameFr,
      executiveSummary,
      keyFacts,
      trends,
      completedActions,
      recommendations,
      discussionPoints,
    });

    // Sanity check KPI : confronte les nombres cités par l'IA dans keyFacts
    // avec les valeurs réelles du signals. Un rapport client-facing ne doit
    // jamais citer un chiffre inventé — c'est l'un des modes de casse les
    // plus graves (signe de qualité douteux, perte de confiance client).
    const signalsNumbers = collectSignalsNumbers(signals);
    const unverifiedNumbers = verifyKeyFactNumbers(keyFacts, signalsNumbers);
    if (unverifiedNumbers.length > 0) {
      console.warn(
        `[ai-monthly-report] ${unverifiedNumbers.length} keyFact(s) contiennent des nombres non corroborés par la DB — à revoir avant envoi client`,
      );
    }

    return {
      organizationId: signals.organizationId,
      organizationName: signals.organizationName,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      executiveSummary,
      keyFacts,
      trends,
      completedActions,
      recommendations,
      discussionPoints,
      markdown,
      generatedAt: new Date().toISOString(),
      unverifiedNumbers,
    };
  } catch (err) {
    console.warn(
      `[ai-monthly-report] org ${args.organizationId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sanity check — vérification des nombres cités par l'IA dans keyFacts.
//
// Approche : on extrait récursivement tous les nombres entiers ≥ 2 présents
// dans le payload signals (tickets.total, backups.failed, etc.). Pour chaque
// keyFact, on extrait les nombres mentionnés et on vérifie qu'ils existent
// dans cet ensemble (avec tolérance ±10% pour absorber les arrondis/conversions
// unités comme minutes → heures). Les nombres orphelins sont loggés.
//
// Limites connues :
//   - Les pourcentages sont comparés bruts (pas de conversion ratio→absolu)
//   - Les petites valeurs (0, 1) sont ignorées — trop communes, bruit
//   - Ne couvre pas les nombres dans les autres champs (trends, recommendations)
//     qui sont plus interprétatifs et moins chiffrés
// ---------------------------------------------------------------------------
function collectSignalsNumbers(obj: unknown): Set<number> {
  const out = new Set<number>();
  function walk(v: unknown): void {
    if (v === null || v === undefined) return;
    if (typeof v === "number" && Number.isFinite(v) && v >= 2) {
      out.add(Math.round(v));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) {
        walk(val);
      }
    }
  }
  walk(obj);
  return out;
}

function extractIntegers(text: string): number[] {
  const matches = text.match(/\b\d+\b/g);
  if (!matches) return [];
  return matches
    .map((m) => parseInt(m, 10))
    .filter((n) => Number.isFinite(n) && n >= 2 && n < 1_000_000);
}

function verifyKeyFactNumbers(
  keyFacts: string[],
  signalsNumbers: Set<number>,
): Array<{ keyFactIndex: number; fact: string; suspects: number[] }> {
  const TOLERANCE_PCT = 0.1; // ±10%
  const result: Array<{ keyFactIndex: number; fact: string; suspects: number[] }> =
    [];
  const signalsArr = Array.from(signalsNumbers);
  for (let i = 0; i < keyFacts.length; i++) {
    const fact = keyFacts[i];
    const cited = extractIntegers(fact);
    if (cited.length === 0) continue;
    const suspects: number[] = [];
    for (const n of cited) {
      // Match exact d'abord, puis match tolérant (absorbe 4.2h→4h ou 67%→66%)
      if (signalsNumbers.has(n)) continue;
      const found = signalsArr.some(
        (s) => Math.abs(s - n) / Math.max(s, n) <= TOLERANCE_PCT,
      );
      if (!found) suspects.push(n);
    }
    if (suspects.length > 0) {
      result.push({ keyFactIndex: i, fact, suspects });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pickStringArray(x: unknown, max: number): string[] {
  if (!Array.isArray(x)) return [];
  return (x as unknown[])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().slice(0, 400))
    .filter((s) => s.length > 0)
    .slice(0, max);
}

function buildMarkdown(args: {
  orgName: string;
  monthNameFr: string;
  executiveSummary: string;
  keyFacts: string[];
  trends: string[];
  completedActions: string[];
  recommendations: string[];
  discussionPoints: string[];
}): string {
  const sections: string[] = [
    `# Rapport mensuel — ${args.orgName}`,
    `*${args.monthNameFr}*`,
    "",
    "## Résumé exécutif",
    args.executiveSummary,
  ];
  if (args.keyFacts.length > 0) {
    sections.push("", "## Faits saillants");
    sections.push(...args.keyFacts.map((f) => `- ${f}`));
  }
  if (args.trends.length > 0) {
    sections.push("", "## Tendances observées");
    sections.push(...args.trends.map((t) => `- ${t}`));
  }
  if (args.completedActions.length > 0) {
    sections.push("", "## Actions accomplies");
    sections.push(...args.completedActions.map((a) => `- ${a}`));
  }
  if (args.recommendations.length > 0) {
    sections.push("", "## Recommandations pour le prochain mois");
    sections.push(...args.recommendations.map((r) => `- ${r}`));
  }
  if (args.discussionPoints.length > 0) {
    sections.push("", "## Points à discuter en rencontre");
    sections.push(...args.discussionPoints.map((d) => `- ${d}`));
  }
  return sections.join("\n");
}

function formatTrend(trend: number | null): string {
  if (trend == null) return "—";
  if (trend === 0) return "stable";
  return trend > 0 ? `+${trend}%` : `${trend}%`;
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
