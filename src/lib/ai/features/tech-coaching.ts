// ============================================================================
// AI TECH COACHING — Phase 3 #15.
//
// Analyse les données opérationnelles pour identifier les besoins de
// formation / coaching de l'équipe technique. Scope global (pas par
// tech individuel par défaut — éviter le "tracking" individuel mal vécu).
//
// Identifie :
//   - Les catégories de tickets qui traînent / escaladent le plus
//   - Les thèmes où il existe un écart de performance entre agents (sans
//     nommer les agents dans la sortie — on reste aux patterns)
//   - Les domaines où la documentation manque (inféré : beaucoup de
//     questions similaires sans KB article existant)
//   - Les tendances d'amélioration à suivre
//
// Sortie : plan de coaching structuré à remettre à un SUPERVISOR.
//
// Sensitivity "internal" (pas de PII client) mais scrub activé pour
// éviter que des noms d'utilisateurs / hostnames fuient par accident.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_TECH_COACHING } from "@/lib/ai/orchestrator/policies";

export interface CoachingTopic {
  /** Nom du sujet de formation suggéré. */
  topic: string;
  /** Pourquoi on l'identifie. */
  rationale: string;
  /** Fréquence/volume observé. */
  signals: string[];
  /** Priorité opérationnelle. */
  priority: "low" | "medium" | "high";
  /** Format suggéré (capsule, shadowing, documentation, …). */
  format: "capsule" | "shadowing" | "documentation" | "workshop" | "other";
}

export interface TechCoachingReport {
  periodDays: number;
  /** Synthèse pour le superviseur, 1-2 paragraphes. */
  summary: string;
  /** Sujets de formation priorisés. */
  topics: CoachingTopic[];
  /** Gaps documentation : catégories qui manquent d'articles KB. */
  documentationGaps: string[];
  /** Tendances positives à célébrer. */
  positiveTrends: string[];
  generatedAt: string;
}

export async function generateTechCoachingReport(args: {
  sinceDays?: number;
}): Promise<TechCoachingReport | null> {
  const sinceDays = args.sinceDays ?? 60;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  try {
    // Chiffres agrégés par catégorie : volume, temps moyen, escalades.
    // On ne nomme PAS les agents — on regarde les patterns par type de
    // problème pour déduire "sur quel type de problème on perd du temps".
    const tickets = await prisma.ticket.findMany({
      where: {
        createdAt: { gte: since },
      },
      select: {
        id: true,
        status: true,
        isEscalated: true,
        slaBreached: true,
        createdAt: true,
        resolvedAt: true,
        type: true,
        category: { select: { name: true } },
      },
    });

    if (tickets.length < 20) {
      return {
        periodDays: sinceDays,
        summary:
          "Volume insuffisant sur la période pour tirer des conclusions fiables de coaching.",
        topics: [],
        documentationGaps: [],
        positiveTrends: [],
        generatedAt: new Date().toISOString(),
      };
    }

    // Calcule volume + temps moyen + taux d'escalade par catégorie.
    const byCat = new Map<
      string,
      {
        total: number;
        escalated: number;
        slaBreached: number;
        resolved: number;
        totalResolutionH: number;
      }
    >();
    for (const t of tickets) {
      const key = t.category?.name ?? "(sans catégorie)";
      if (!byCat.has(key)) {
        byCat.set(key, {
          total: 0,
          escalated: 0,
          slaBreached: 0,
          resolved: 0,
          totalResolutionH: 0,
        });
      }
      const entry = byCat.get(key)!;
      entry.total++;
      if (t.isEscalated) entry.escalated++;
      if (t.slaBreached) entry.slaBreached++;
      if (t.resolvedAt) {
        entry.resolved++;
        entry.totalResolutionH +=
          (t.resolvedAt.getTime() - t.createdAt.getTime()) / 3_600_000;
      }
    }

    const catStats = Array.from(byCat.entries())
      .map(([name, s]) => ({
        category: name,
        total: s.total,
        escalationRate: s.total > 0 ? +(s.escalated / s.total).toFixed(2) : 0,
        slaBreachRate: s.total > 0 ? +(s.slaBreached / s.total).toFixed(2) : 0,
        avgResolutionH:
          s.resolved > 0 ? +(s.totalResolutionH / s.resolved).toFixed(1) : null,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // Documentation gaps : categories avec beaucoup de tickets mais peu
    // d'articles KB associés.
    const kbByCat = await prisma.article.groupBy({
      by: ["categoryId"],
      _count: { _all: true },
    });
    const kbCountById = new Map<string, number>();
    for (const row of kbByCat) {
      if (row.categoryId) kbCountById.set(row.categoryId, row._count._all);
    }

    const categoriesWithIds = await prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const kbCountByName = new Map<string, number>();
    for (const c of categoriesWithIds) {
      kbCountByName.set(c.name, kbCountById.get(c.id) ?? 0);
    }

    const docGaps = catStats
      .filter(
        (s) => s.total >= 5 && (kbCountByName.get(s.category) ?? 0) < 2,
      )
      .map((s) => s.category);

    const system = `Tu es un manager MSP expérimenté qui identifie des besoins de formation à partir des données opérationnelles agrégées (PAS de tracking individuel).

Tu réponds EXCLUSIVEMENT en JSON strict :
{
  "summary": "1-2 paragraphes pour le superviseur",
  "topics": [
    {
      "topic": "sujet de formation",
      "rationale": "pourquoi c'est prioritaire maintenant",
      "signals": ["signal observé 1", "signal observé 2"],
      "priority": "low|medium|high",
      "format": "capsule|shadowing|documentation|workshop|other"
    }
  ],
  "documentationGaps": ["catégorie 1 qui manque de KB", ...],
  "positiveTrends": ["tendance positive à reconnaitre 1", ...]
}

Règles :
- NE PAS nommer d'agents. Rester au niveau des patterns ("les billets catégorie X prennent 2x plus de temps que la moyenne").
- topics : 3-6 sujets, priorisés par impact opérationnel.
- priority "high" : catégorie majeure + délais élevés + escalades fréquentes.
- format : propose le format adapté. Capsule (30 min, asynchrone) pour apprendre un outil. Shadowing pour transmettre du savoir tacite. Documentation pour combler un gap KB. Workshop pour mettre à jour sur une techno.
- positiveTrends : 1-3 tendances vraiment positives (amélioration des délais, KB qui grandit, baisse d'escalades). Chaîne vide si rien de clair.`;

    const user = `Période : ${sinceDays} derniers jours
Tickets analysés : ${tickets.length}

=== STATISTIQUES PAR CATÉGORIE (top 15) ===
${catStats
  .map(
    (s) =>
      `${s.category} : ${s.total} tickets, escalade ${Math.round(s.escalationRate * 100)}%, SLA breach ${Math.round(s.slaBreachRate * 100)}%, délai moyen ${s.avgResolutionH ?? "—"}h${(() => {
        const kb = kbCountByName.get(s.category) ?? 0;
        return `, ${kb} article(s) KB`;
      })()}`,
  )
  .join("\n")}

=== GAPS DOCUMENTATION DÉTECTÉS (volume élevé + KB < 2) ===
${docGaps.length === 0 ? "(aucun)" : docGaps.join(", ")}`;

    const result = await runAiTask({
      policy: POLICY_TECH_COACHING,
      taskKind: "summarization",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    const parsed = parseJson(result.content);
    if (!parsed) return null;

    const summary = String(parsed.summary ?? "").trim();
    const topics: CoachingTopic[] = Array.isArray(parsed.topics)
      ? (parsed.topics as unknown[])
          .map((x) => normalizeTopic(x))
          .filter((x): x is CoachingTopic => x !== null)
          .slice(0, 8)
      : [];
    const documentationGaps = pickStringArray(parsed.documentationGaps, 8);
    const positiveTrends = pickStringArray(parsed.positiveTrends, 5);

    return {
      periodDays: sinceDays,
      summary,
      topics,
      documentationGaps,
      positiveTrends,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(
      `[ai-tech-coaching] failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function normalizeTopic(x: unknown): CoachingTopic | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const topic = String(o.topic ?? "").trim();
  if (!topic) return null;
  const priority: CoachingTopic["priority"] =
    o.priority === "low" || o.priority === "high" ? o.priority : "medium";
  const formatRaw = String(o.format ?? "").toLowerCase();
  const format: CoachingTopic["format"] =
    formatRaw === "capsule" ||
    formatRaw === "shadowing" ||
    formatRaw === "documentation" ||
    formatRaw === "workshop"
      ? (formatRaw as CoachingTopic["format"])
      : "other";
  return {
    topic: topic.slice(0, 160),
    rationale: String(o.rationale ?? "").slice(0, 400),
    signals: Array.isArray(o.signals)
      ? (o.signals as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 5)
      : [],
    priority,
    format,
  };
}

function pickStringArray(x: unknown, max: number): string[] {
  if (!Array.isArray(x)) return [];
  return (x as unknown[])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
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
