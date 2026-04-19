// ============================================================================
// AI RISK ANALYSIS — Phase 3 #8.
//
// Prend un snapshot des signaux opérationnels d'un client (tickets, monitoring,
// sauvegardes, sécurité, faits AiMemory, assets RMM) et produit :
//   - un profil de risque structuré par domaine (operational, security,
//     infrastructure, compliance)
//   - les incidents chroniques détectés
//   - les endpoints / utilisateurs / services à risque
//   - des recommandations priorisées avec impact estimé
//
// Ce n'est PAS un rapport client — c'est une vue interne pour l'équipe
// opérations/projets pour décider où agir. Le rapport exécutif client
// (Phase 3 #11) reste plus narratif.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_RISK_ANALYSIS } from "@/lib/ai/orchestrator/policies";
import { collectOrgSignals, type OrgSignals } from "./signals";

export interface RiskFinding {
  /** Domaine — aide l'UI à grouper / coloriser. */
  domain: "operational" | "security" | "infrastructure" | "compliance";
  /** Titre court (≤ 80 char). */
  title: string;
  /** Explication factuelle en 1-3 phrases. */
  evidence: string;
  /** Niveau de risque si non traité. */
  severity: "low" | "medium" | "high" | "critical";
  /** Références aux signaux sources (ex: "12 tickets d'impression", "3 hôtes avec > 10 alertes"). */
  signals: string[];
}

export interface RiskRecommendation {
  /** Action concrète recommandée. */
  title: string;
  /** Bénéfice attendu + quel risque ça réduit. */
  rationale: string;
  /** Effort estimé — aide le gestionnaire à prioriser. */
  effort: "low" | "medium" | "high";
  /** Impact estimé sur le risque global. */
  impact: "low" | "medium" | "high";
  /** Référence aux findings adressés. */
  addressesFindings: string[];
}

export interface RiskAnalysis {
  organizationId: string;
  organizationName: string;
  sinceDays: number;
  /** Score global 0-100. 0 = excellent, 100 = client en feu. */
  overallRiskScore: number;
  /** Synthèse 1-2 phrases pour la tête de rapport. */
  summary: string;
  findings: RiskFinding[];
  recommendations: RiskRecommendation[];
  generatedAt: string;
}

export async function analyzeClientRisks(args: {
  organizationId: string;
  sinceDays?: number;
}): Promise<RiskAnalysis | null> {
  try {
    const signals = await collectOrgSignals({
      organizationId: args.organizationId,
      sinceDays: args.sinceDays ?? 60,
    });
    if (!signals) return null;

    // Garde-fou : si l'activité est presque nulle, inutile d'appeler l'IA.
    const totalActivity =
      signals.tickets.total +
      signals.monitoring.total +
      signals.security.total +
      signals.backups.total;
    if (totalActivity < 5) {
      return {
        organizationId: signals.organizationId,
        organizationName: signals.organizationName,
        sinceDays: signals.sinceDays,
        overallRiskScore: 0,
        summary:
          "Activité très faible sur la période — pas assez de données pour une analyse de risque pertinente.",
        findings: [],
        recommendations: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const system = `Tu es un analyste MSP senior qui synthétise les signaux opérationnels d'un client en un profil de risque structuré. Tu t'adresses à l'équipe interne — la sortie sert à décider où concentrer l'effort technique et commercial.

Tu réponds EXCLUSIVEMENT en JSON strict :
{
  "overallRiskScore": 0-100,
  "summary": "1-2 phrases",
  "findings": [
    { "domain": "operational|security|infrastructure|compliance", "title": "...", "evidence": "...", "severity": "low|medium|high|critical", "signals": ["..."] }
  ],
  "recommendations": [
    { "title": "...", "rationale": "...", "effort": "low|medium|high", "impact": "low|medium|high", "addressesFindings": ["titre du finding"] }
  ]
}

Règles :
- overallRiskScore : reflete l'image d'ensemble. 0-20 excellent, 20-40 sain, 40-60 surveillance, 60-80 préoccupant, 80-100 critique.
- findings : 3-8 items. Chaque item doit être FACTUEL — fonde chaque claim sur les chiffres fournis. Pas d'invention.
- severity : basée sur la criticité DU risque si non adressé, pas sur le volume.
- recommendations : 3-6 actions concrètes priorisables. Match avec les findings via addressesFindings.
- effort/impact : triangule pour que l'équipe priorise les quick wins (low effort, high impact) en tête de liste.
- Omets les domaines sans data pertinente plutôt que remplir pour remplir.`;

    const user = `Client : ${signals.organizationName}
Période : ${signals.sinceDays} derniers jours

=== TICKETS ===
Total : ${signals.tickets.total} (tendance ${formatTrend(signals.tickets.trendVsPrevious)})
Encore ouverts : ${signals.tickets.stillOpen}
SLA breachés : ${signals.tickets.slaBreached}
Escaladés : ${signals.tickets.escalated}
Résolution moyenne : ${signals.tickets.avgResolutionHours ?? "—"} h
Par catégorie (top 10) : ${formatKV(signals.tickets.byCategory.map((c) => [c.name, c.count]))}
Par priorité : ${formatRecord(signals.tickets.byPriority)}
Par type : ${formatRecord(signals.tickets.byType)}
Par statut : ${formatRecord(signals.tickets.byStatus)}
Sujets récents : ${signals.tickets.topSubjects.slice(0, 8).join(" | ")}

=== MONITORING (Infrastructure) ===
Total alertes : ${signals.monitoring.total}
Non résolues : ${signals.monitoring.unresolved}
Par sévérité : ${formatRecord(signals.monitoring.bySeverity)}
Par source : ${formatRecord(signals.monitoring.bySource)}
Top hôtes : ${formatKV(signals.monitoring.topHosts.map((h) => [h.host, h.count]))}

=== SÉCURITÉ ===
Total incidents : ${signals.security.total}
Par type : ${formatRecord(signals.security.byKind)}
Par sévérité : ${formatRecord(signals.security.bySeverity)}
Top endpoints touchés : ${formatKV(signals.security.topEndpoints.map((e) => [e.endpoint, e.count]))}

=== SAUVEGARDES ===
Total : ${signals.backups.total}
Échecs : ${signals.backups.failed}
Avertissements : ${signals.backups.warning}
Succès : ${signals.backups.success}
Tâches qui échouent le plus : ${formatKV(signals.backups.topFailingJobs.map((j) => [j.job, j.count]))}

=== PARC (Atera) ===
Total assets : ${signals.assets.total}
Garanties expirées : ${signals.assets.warrantyExpired}
Garanties < 90 jours : ${signals.assets.warrantyExpiringSoon}
Par type : ${formatRecord(signals.assets.byType)}

=== FAITS CONNUS (AiMemory — conventions / quirks / préférences) ===
${
  signals.extractedFacts.length === 0
    ? "(aucun fait extrait)"
    : signals.extractedFacts.map((f) => `[${f.kind}${f.verified ? "" : ", non vérifié"}] ${f.content}`).join("\n")
}`;

    const result = await runAiTask({
      policy: POLICY_RISK_ANALYSIS,
      context: { organizationId: signals.organizationId },
      taskKind: "summarization",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    const parsed = parseJson(result.content);
    if (!parsed) return null;

    const score = Number(parsed.overallRiskScore);
    const overallRiskScore = Number.isFinite(score)
      ? Math.max(0, Math.min(100, Math.round(score)))
      : computeFallbackScore(signals);

    const summary = String(parsed.summary ?? "").trim();

    const findings: RiskFinding[] = Array.isArray(parsed.findings)
      ? (parsed.findings as unknown[])
          .map((x) => normalizeFinding(x))
          .filter((x): x is RiskFinding => x !== null)
          .slice(0, 10)
      : [];

    const recommendations: RiskRecommendation[] = Array.isArray(
      parsed.recommendations,
    )
      ? (parsed.recommendations as unknown[])
          .map((x) => normalizeRecommendation(x))
          .filter((x): x is RiskRecommendation => x !== null)
          .slice(0, 8)
      : [];

    const analysis: RiskAnalysis = {
      organizationId: signals.organizationId,
      organizationName: signals.organizationName,
      sinceDays: signals.sinceDays,
      overallRiskScore,
      summary,
      findings,
      recommendations,
      generatedAt: new Date().toISOString(),
    };

    // Cache dans AiPattern pour éviter de recalculer à chaque fetch UI.
    // Scope = "risk:{orgId}", kind = "snapshot". Un seul enregistrement par
    // org — overridé à chaque run.
    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: `risk:${signals.organizationId}`,
            kind: "snapshot",
            key: "current",
          },
        },
        create: {
          scope: `risk:${signals.organizationId}`,
          kind: "snapshot",
          key: "current",
          value: analysis as unknown as import("@prisma/client").Prisma.InputJsonValue,
          sampleCount: totalActivity,
          confidence: Math.min(1, totalActivity / 50),
        },
        update: {
          value: analysis as unknown as import("@prisma/client").Prisma.InputJsonValue,
          sampleCount: totalActivity,
          confidence: Math.min(1, totalActivity / 50),
        },
      });
    } catch (err) {
      console.warn("[ai-risk] cache write failed:", err);
    }

    return analysis;
  } catch (err) {
    console.warn(
      `[ai-risk] org ${args.organizationId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

export async function getLastRiskAnalysis(
  organizationId: string,
): Promise<RiskAnalysis | null> {
  const row = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: `risk:${organizationId}`,
        kind: "snapshot",
        key: "current",
      },
    },
  });
  if (!row) return null;
  return row.value as unknown as RiskAnalysis;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeFinding(x: unknown): RiskFinding | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const title = String(o.title ?? "").trim();
  if (!title) return null;
  const domainRaw = String(o.domain ?? "operational").toLowerCase();
  const domain: RiskFinding["domain"] =
    domainRaw === "security" ||
    domainRaw === "infrastructure" ||
    domainRaw === "compliance" ||
    domainRaw === "operational"
      ? (domainRaw as RiskFinding["domain"])
      : "operational";
  const severityRaw = String(o.severity ?? "medium").toLowerCase();
  const severity: RiskFinding["severity"] =
    severityRaw === "critical" ||
    severityRaw === "high" ||
    severityRaw === "medium" ||
    severityRaw === "low"
      ? (severityRaw as RiskFinding["severity"])
      : "medium";
  return {
    domain,
    title: title.slice(0, 120),
    evidence: String(o.evidence ?? "").slice(0, 400),
    severity,
    signals: Array.isArray(o.signals)
      ? (o.signals as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 6)
      : [],
  };
}

function normalizeRecommendation(x: unknown): RiskRecommendation | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const title = String(o.title ?? "").trim();
  if (!title) return null;
  const effort: RiskRecommendation["effort"] =
    o.effort === "low" || o.effort === "high" ? o.effort : "medium";
  const impact: RiskRecommendation["impact"] =
    o.impact === "low" || o.impact === "high" ? o.impact : "medium";
  return {
    title: title.slice(0, 160),
    rationale: String(o.rationale ?? "").slice(0, 400),
    effort,
    impact,
    addressesFindings: Array.isArray(o.addressesFindings)
      ? (o.addressesFindings as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 5)
      : [],
  };
}

/** Score de fallback si l'IA n'en produit pas un plausible. */
function computeFallbackScore(s: OrgSignals): number {
  let score = 0;
  score += Math.min(25, s.tickets.slaBreached * 2);
  score += Math.min(15, s.tickets.escalated * 1.5);
  score += Math.min(20, s.backups.failed * 3);
  score += Math.min(20, s.security.total * 1);
  score += Math.min(10, s.monitoring.unresolved * 0.5);
  score += Math.min(10, s.assets.warrantyExpired * 0.5);
  return Math.min(100, Math.round(score));
}

function formatTrend(trend: number | null): string {
  if (trend == null) return "—";
  if (trend === 0) return "stable";
  return trend > 0 ? `+${trend}%` : `${trend}%`;
}

function formatRecord(r: Record<string, number>): string {
  const entries = Object.entries(r).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}=${v}`).join(", ");
}

function formatKV(kv: Array<[string, number]>): string {
  if (kv.length === 0) return "—";
  return kv.map(([k, v]) => `${k}=${v}`).join(", ");
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
