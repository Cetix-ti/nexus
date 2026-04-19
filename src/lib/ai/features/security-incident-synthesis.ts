// ============================================================================
// SECURITY INCIDENT SYNTHESIS (IA) — génère un rapport narratif structuré
// à partir d'un incident agrégé et de son historique d'alertes.
//
// Remplace "j'ai 40 lignes de log, qu'est-ce qui s'est passé ?". Produit :
//   - executiveSummary : 2-3 phrases pour le client/gestion
//   - technicalNarrative : narratif technique pour le SOC (5-10 phrases)
//   - timeline : événements reconstruits (quand/quoi/acteur)
//   - hypotheses : 1-4 hypothèses de cause racine priorisées
//   - impactAssessment : actifs concernés + niveau d'impact
//   - immediateNextSteps : 3-6 actions à court terme (non appliquées)
//   - longTermRecommendations : suggestions de durcissement / tuning règle
//
// Usage : bouton "Générer synthèse" sur la fiche incident. Résultat stocké
// dans incident.metadata.aiSynthesis avec timestamp. Se regénère manuellement
// si de nouvelles alertes arrivent.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask, tryParseJson } from "@/lib/ai/orchestrator";
import { POLICY_SECURITY_INCIDENT_SYNTHESIS } from "@/lib/ai/orchestrator/policies";

export interface IncidentSynthesisResult {
  executiveSummary: string;
  technicalNarrative: string;
  timeline: Array<{
    at: string; // ISO-like "2026-04-19 14:23" ou date si heure inconnue
    event: string;
    actor?: string;
  }>;
  hypotheses: Array<{
    summary: string;
    likelihood: "high" | "medium" | "low";
    supportingEvidence: string;
  }>;
  impactAssessment: {
    scope: string;
    severity: "critical" | "high" | "moderate" | "low" | "none";
    affectedAssets: string[];
  };
  immediateNextSteps: string[];
  longTermRecommendations: string[];
  invocationId?: string;
}

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function asString(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function asStringArray(x: unknown, max = 10): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, max)
    .map((s) => s.trim());
}

export async function synthesizeSecurityIncident(args: {
  incidentId: string;
}): Promise<IncidentSynthesisResult | null> {
  const incident = await prisma.securityIncident.findUnique({
    where: { id: args.incidentId },
    include: {
      organization: { select: { id: true, name: true } },
      alerts: {
        orderBy: { receivedAt: "asc" }, // chronologique pour la timeline
        take: 60,
        select: {
          id: true,
          receivedAt: true,
          severity: true,
          title: true,
          summary: true,
          kind: true,
          source: true,
        },
      },
    },
  });
  if (!incident) return null;

  const alertsBlock = incident.alerts
    .map((a, i) => {
      const t = a.receivedAt.toISOString().slice(0, 19).replace("T", " ");
      return `${String(i + 1).padStart(2, "0")}. [${t} · ${a.source}/${a.kind} · ${a.severity ?? "?"}] ${a.title}\n    ${stripHtml(a.summary).slice(0, 300)}`;
    })
    .join("\n");

  const metadataBlock =
    incident.metadata && typeof incident.metadata === "object"
      ? JSON.stringify(incident.metadata).slice(0, 2500)
      : "(aucune)";

  // Récupère le triage IA récent s'il existe — permet à la synthèse de
  // s'aligner avec la classification déjà faite (MITRE, urgence).
  const existingTriage = (incident.metadata as
    | { aiTriage?: Record<string, unknown> }
    | null)?.aiTriage;

  const triageBlock = existingTriage
    ? `## Triage IA précédent (à prendre en compte)
MITRE : ${existingTriage.mitreTactic ?? "?"} / ${existingTriage.mitreTechnique ?? "?"}
Sévérité suggérée : ${existingTriage.suggestedSeverity ?? "?"}
Action : ${existingTriage.actionCategory ?? "?"}
Urgence : ${existingTriage.urgency ?? "?"}
Raisonnement : ${existingTriage.reasoning ?? ""}`
    : "";

  const system = `Tu es un analyste SOC senior chargé de rédiger une synthèse narrative d'un incident de sécurité pour un MSP. Ton lectorat :
  - Ligne 1 (executiveSummary) : le client ou un gestionnaire non-technique.
  - Reste : le technicien qui va investiguer ou remédier.

Tu reçois les alertes brutes décodées (AD, Wazuh, Bitdefender) groupées sous un même incident. Tu reconstitues l'histoire.

Format JSON strict (sans markdown, sans préambule) :
{
  "executiveSummary": "2-3 phrases simples, sans jargon technique, qui répondent à : qu'est-ce qui s'est passé ? est-ce dangereux ? qu'allons-nous faire ?",
  "technicalNarrative": "5-10 phrases factuelles en ordre chronologique avec les détails techniques (hostnames, noms d'utilisateurs, CVEs, outils). Pas d'hypothèses ici — seulement ce que les alertes montrent.",
  "timeline": [
    { "at": "2026-04-19 14:23", "event": "description courte", "actor": "user ou hostname concerné" }
  ],
  "hypotheses": [
    { "summary": "hypothèse de cause racine", "likelihood": "high" | "medium" | "low", "supportingEvidence": "pointe vers les alertes ou artefacts qui appuient" }
  ],
  "impactAssessment": {
    "scope": "description courte du périmètre (1 endpoint, N users, domaine, etc.)",
    "severity": "critical" | "high" | "moderate" | "low" | "none",
    "affectedAssets": ["hostname1", "user@domain", "CVE-XXXX-YYYY"]
  },
  "immediateNextSteps": ["3-6 actions à court terme, concrètes, dans l'ordre"],
  "longTermRecommendations": ["2-4 suggestions de durcissement, tuning de règle, formation, etc."]
}

RÈGLES :
- Ne JAMAIS inventer de hash, IP, CVE ou outil. Si ce n'est pas dans les alertes, ne le cite pas.
- Si les données sont insuffisantes pour une section, mets une chaîne vide ou un tableau vide — ne fabrique pas du contenu.
- Sois CONCIS. Un tech SOC a 3 minutes pour lire — chaque mot compte.
- Reste factuel dans technicalNarrative et timeline. Les conjectures vont dans hypotheses.
- Si un triage IA précédent existe, aligne toi avec sa classification MITRE et sa sévérité sauf si tu as une raison explicite de diverger (mentionne-la alors dans reasoning des hypothèses).`;

  const user = `# Incident #${incident.id}
Source : ${incident.source}
Kind : ${incident.kind}
Sévérité : ${incident.severity ?? "—"}
Client : ${incident.organization?.name ?? "(non mappé)"}
Endpoint : ${incident.endpoint ?? "—"}
User concerné : ${incident.userPrincipal ?? "—"}
Logiciel : ${incident.software ?? "—"}
CVE : ${incident.cveId ?? "—"}
Occurrences : ${incident.occurrenceCount}
Période : ${incident.firstSeenAt.toISOString().slice(0, 19).replace("T", " ")} → ${incident.lastSeenAt.toISOString().slice(0, 19).replace("T", " ")}
Titre : ${incident.title}
Résumé initial : ${stripHtml(incident.summary).slice(0, 800)}

## Métadonnées décodées
${metadataBlock}

## Historique des alertes (chronologique, ${incident.alerts.length} récupérées)
${alertsBlock || "(aucune)"}

${triageBlock}

Produis la synthèse JSON selon le format spécifié.`;

  const result = await runAiTask({
    policy: POLICY_SECURITY_INCIDENT_SYNTHESIS,
    context: {
      organizationId: incident.organizationId ?? undefined,
    },
    taskKind: "summarization",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  if (!result.ok || !result.content) return null;
  const parsed = tryParseJson(result.content) as Record<string, unknown> | null;
  if (!parsed) return null;

  const timeline = Array.isArray(parsed.timeline)
    ? (parsed.timeline as unknown[])
        .slice(0, 30)
        .map((t) => {
          if (!t || typeof t !== "object") return null;
          const x = t as Record<string, unknown>;
          const at = asString(x.at);
          const event = asString(x.event);
          if (!event) return null;
          return {
            at,
            event,
            actor: typeof x.actor === "string" ? x.actor : undefined,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];

  const hypotheses = Array.isArray(parsed.hypotheses)
    ? (parsed.hypotheses as unknown[])
        .slice(0, 6)
        .map((h) => {
          if (!h || typeof h !== "object") return null;
          const x = h as Record<string, unknown>;
          const summary = asString(x.summary);
          if (!summary) return null;
          const lk = asString(x.likelihood).toLowerCase();
          const likelihood: "high" | "medium" | "low" =
            lk === "high" || lk === "medium" || lk === "low" ? lk : "medium";
          return {
            summary,
            likelihood,
            supportingEvidence: asString(x.supportingEvidence),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];

  const impactRaw = (parsed.impactAssessment ?? {}) as Record<string, unknown>;
  const impactSeverity = asString(impactRaw.severity).toLowerCase();
  const validSeverities = [
    "critical",
    "high",
    "moderate",
    "low",
    "none",
  ] as const;
  const impactAssessment = {
    scope: asString(impactRaw.scope),
    severity: (validSeverities.find((s) => s === impactSeverity) ??
      "moderate") as IncidentSynthesisResult["impactAssessment"]["severity"],
    affectedAssets: asStringArray(impactRaw.affectedAssets, 20),
  };

  const synthesis: IncidentSynthesisResult = {
    executiveSummary: asString(parsed.executiveSummary),
    technicalNarrative: asString(parsed.technicalNarrative),
    timeline,
    hypotheses,
    impactAssessment,
    immediateNextSteps: asStringArray(parsed.immediateNextSteps, 8),
    longTermRecommendations: asStringArray(parsed.longTermRecommendations, 6),
    invocationId: result.invocationId,
  };

  // Si tout est vide c'est probablement un ratage de l'LLM — on renvoie null
  // pour que l'UI affiche "pas de résultat exploitable, réessayer".
  if (
    !synthesis.executiveSummary &&
    !synthesis.technicalNarrative &&
    synthesis.timeline.length === 0
  ) {
    return null;
  }

  return synthesis;
}
