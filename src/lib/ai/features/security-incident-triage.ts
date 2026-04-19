// ============================================================================
// SECURITY INCIDENT TRIAGE (IA) — classe un incident de sécurité :
//   - tactique + technique MITRE ATT&CK suggérées
//   - sévérité suggérée (éventuellement différente de la sévérité brute)
//   - probabilité de faux positif
//   - catégorie d'action (investigate / remediate / tune_rule / dismiss)
//   - urgence relative (immediate / high / normal / low)
//   - 3-7 actions recommandées, concrètes et actionnables
//
// Input contexte :
//   - incident lui-même + alertes agrégées (jusqu'à 30 récentes)
//   - metadata décodée (MITRE IDs fournis par Bitdefender, whitelist hits, …)
//   - 5 incidents fermés similaires chez le MÊME client (apprentissage implicite)
//   - feedback historique : si une alerte identique a été marquée FP dans le
//     passé, on injecte le signal pour réduire le bruit
//
// Output : un objet structuré stocké dans incident.metadata.aiTriage avec
// timestamp — l'UI affiche, l'humain décide. Aucune action automatique.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask, tryParseJson } from "@/lib/ai/orchestrator";
import { POLICY_SECURITY_INCIDENT_TRIAGE } from "@/lib/ai/orchestrator/policies";
import {
  normalizeTactic,
  normalizeTechnique,
  filterValidTactics,
  filterValidTechniques,
} from "@/lib/ai/validators/mitre";

export interface IncidentTriageResult {
  mitreTactic: string | null;
  mitreTactics: string[];
  mitreTechnique: string | null;
  mitreTechniques: string[];
  suggestedSeverity: "critical" | "high" | "warning" | "info" | null;
  falsePositiveProbability: number; // 0..1
  urgency: "immediate" | "high" | "normal" | "low";
  actionCategory: "investigate" | "remediate" | "tune_rule" | "dismiss";
  confidence: number; // 0..1
  reasoning: string;
  recommendedActions: Array<{
    order: number;
    action: string;
    command?: string;
    rationale?: string;
  }>;
  invocationId?: string;
}

const SEVERITY_OPTIONS = ["critical", "high", "warning", "info"] as const;
const URGENCY_OPTIONS = ["immediate", "high", "normal", "low"] as const;
const CATEGORY_OPTIONS = [
  "investigate",
  "remediate",
  "tune_rule",
  "dismiss",
] as const;

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function clampProb(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return Math.min(1, n / 100); // tolère "70" → 0.7
  return n;
}

function pickEnum<T extends string>(
  value: unknown,
  options: readonly T[],
): T | null {
  if (typeof value !== "string") return null;
  const lc = value.toLowerCase().trim();
  return options.find((o) => o === lc) ?? null;
}

/**
 * Triage IA d'un incident. Retourne null si l'IA n'est pas disponible ou si
 * la réponse est malformée. Sinon retourne le résultat structuré + l'id
 * d'invocation pour capter le humanAction ultérieur.
 */
export async function triageSecurityIncident(args: {
  incidentId: string;
}): Promise<IncidentTriageResult | null> {
  const incident = await prisma.securityIncident.findUnique({
    where: { id: args.incidentId },
    include: {
      organization: { select: { id: true, name: true } },
      alerts: {
        orderBy: { receivedAt: "desc" },
        take: 30,
        select: {
          id: true,
          receivedAt: true,
          severity: true,
          title: true,
          summary: true,
          kind: true,
        },
      },
    },
  });
  if (!incident) return null;

  // Incidents similaires CLOS chez ce même client (apprentissage implicite).
  // On ne filtre que sur le même kind pour éviter de comparer des torchons
  // et des serviettes (un lockout et un CVE n'ont rien à voir).
  const similarClosed = incident.organizationId
    ? await prisma.securityIncident.findMany({
        where: {
          id: { not: incident.id },
          organizationId: incident.organizationId,
          kind: incident.kind,
          status: { in: ["resolved", "closed"] },
        },
        orderBy: { lastSeenAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          metadata: true,
          lastSeenAt: true,
        },
      })
    : [];

  // Combien de fois ce MÊME correlationKey a déjà été marqué comme FP
  // (dans nos invocations précédentes). Signal fort pour l'IA courante.
  const priorFpCount = await prisma.aiInvocation.count({
    where: {
      feature: "security_incident_triage",
      humanAction: "rejected",
      ticketId: null, // ce champ n'est pas pertinent ici
      response: { contains: incident.correlationKey },
    },
  });

  const alertsBlock = incident.alerts
    .map((a, i) => {
      const t = a.receivedAt.toISOString().slice(0, 19).replace("T", " ");
      return `${i + 1}. [${t} · ${a.severity ?? "?"}] ${a.title}\n   ${stripHtml(a.summary).slice(0, 300)}`;
    })
    .join("\n");

  const similarBlock =
    similarClosed.length === 0
      ? "(aucun incident similaire résolu chez ce client)"
      : similarClosed
          .map(
            (s) =>
              `- "${s.title}" (sev=${s.severity ?? "?"}, ${s.status}, fermé ${s.lastSeenAt.toISOString().slice(0, 10)})`,
          )
          .join("\n");

  const metadataBlock =
    incident.metadata && typeof incident.metadata === "object"
      ? JSON.stringify(incident.metadata).slice(0, 2000)
      : "(aucune)";

  // Le system prompt est stable (MITRE catalog résumé + format de sortie)
  // → bénéficie du prompt caching Anthropic (-90% sur l'input répété).
  const system = `Tu es un analyste SOC senior chargé de trier des incidents de sécurité détectés par une plateforme MSP (Wazuh, Active Directory, Bitdefender). Ton rôle est de fournir un triage structuré, factuel, et conservateur.

Pour chaque incident tu DOIS produire :
1. Un mapping MITRE ATT&CK (tactique principale + 0-2 secondaires ; technique principale + 0-2 secondaires). Utilise les IDs officiels (ex: TA0006 pour Credential Access, T1110 pour Brute Force). Si l'incident est ambigu ou purement informationnel, réponds avec null.
2. Une sévérité suggérée parmi: "critical" | "high" | "warning" | "info". Elle peut différer de la sévérité brute — explique pourquoi dans reasoning si c'est le cas.
3. Une probabilité de faux positif entre 0.0 et 1.0. Base-toi sur : patterns de bruit connus, incidents similaires clôturés FP chez ce client, cohérence des artefacts, horaires ouvrables vs suspects, whitelist hit, etc.
4. Une urgence parmi: "immediate" (action < 15 min), "high" (< 2 h), "normal" (< 24 h), "low" (backlog).
5. Une catégorie d'action parmi: "investigate" (besoin de plus d'infos), "remediate" (action concrète : disable user, isolate endpoint, patch), "tune_rule" (règle de détection à ajuster — probable FP récurrent), "dismiss" (FP confirmé ou non-pertinent).
6. 3-7 actions recommandées ordonnées. CHAQUE action doit être concrète (commande PowerShell, CMD, bash, API ou étape de vérification). Champ "command" optionnel si l'action est exécutable shell/PowerShell.
7. Une confidence globale entre 0.0 et 1.0.
8. Un reasoning court (2-4 phrases) qui explique la classification.

PRINCIPES :
- Sois CONSERVATEUR : dans le doute, préfère "investigate" à "remediate".
- Ne JAMAIS inventer un IOC, un hash, un CVE ou une commande. Si tu ne sais pas, dis-le.
- Respecte la sévérité existante sauf raison explicite. Les downgrades/upgrades doivent être justifiés.
- Les actions recommandées ne sont JAMAIS exécutées automatiquement — un humain les valide. Écris-les comme un playbook pour un technicien.

Tu réponds UNIQUEMENT en JSON strict, sans markdown ni préambule :
{
  "mitreTactic": "TA0006" | null,
  "mitreTactics": ["TA0006", "TA0005"],
  "mitreTechnique": "T1110" | null,
  "mitreTechniques": ["T1110", "T1078"],
  "suggestedSeverity": "critical" | "high" | "warning" | "info" | null,
  "falsePositiveProbability": 0.0,
  "urgency": "immediate" | "high" | "normal" | "low",
  "actionCategory": "investigate" | "remediate" | "tune_rule" | "dismiss",
  "confidence": 0.0,
  "reasoning": "court résumé",
  "recommendedActions": [
    { "order": 1, "action": "…", "command": "…", "rationale": "…" }
  ]
}`;

  const user = `# Incident #${incident.id}
Source : ${incident.source}
Kind : ${incident.kind}
Sévérité brute : ${incident.severity ?? "—"}
Client : ${incident.organization?.name ?? "(non mappé)"}
Endpoint : ${incident.endpoint ?? "—"}
User concerné : ${incident.userPrincipal ?? "—"}
Logiciel : ${incident.software ?? "—"}
CVE : ${incident.cveId ?? "—"}
Occurrences : ${incident.occurrenceCount}
Période : ${incident.firstSeenAt.toISOString().slice(0, 19).replace("T", " ")} → ${incident.lastSeenAt.toISOString().slice(0, 19).replace("T", " ")}
Titre : ${incident.title}
Résumé : ${stripHtml(incident.summary).slice(0, 800)}

## Métadonnées décodées
${metadataBlock}

## Historique d'alertes (${incident.alerts.length} plus récentes)
${alertsBlock || "(aucune)"}

## Incidents SIMILAIRES clos chez ce client
${similarBlock}

## Signal historique IA
${priorFpCount > 0 ? `⚠ Ce correlationKey a été marqué faux positif ${priorFpCount} fois par le SOC dans le passé — à prendre en compte.` : "Pas d'historique IA sur ce correlationKey."}

Produis le triage JSON selon le format spécifié.`;

  const result = await runAiTask({
    policy: POLICY_SECURITY_INCIDENT_TRIAGE,
    context: {
      organizationId: incident.organizationId ?? undefined,
    },
    taskKind: "classification",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  if (!result.ok || !result.content) return null;
  const parsed = tryParseJson(result.content) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") return null;

  const actions = Array.isArray(parsed.recommendedActions)
    ? (parsed.recommendedActions as unknown[])
        .slice(0, 10)
        .map((a, i) => {
          if (!a || typeof a !== "object") return null;
          const x = a as Record<string, unknown>;
          const action = typeof x.action === "string" ? x.action.trim() : "";
          if (!action) return null;
          return {
            order: typeof x.order === "number" ? x.order : i + 1,
            action,
            command: typeof x.command === "string" ? x.command : undefined,
            rationale:
              typeof x.rationale === "string" ? x.rationale : undefined,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];

  // Filtre anti-hallucination MITRE : on ne garde que les IDs qui matchent
  // le catalog officiel des tactiques + le format de technique TXXXX(.XXX).
  // Un LLM peut inventer "TA0099" ou "T0000.999" — liens morts côté UI si on
  // ne filtre pas.
  const mitreTacticRaw =
    typeof parsed.mitreTactic === "string" ? parsed.mitreTactic : null;
  const mitreTechniqueRaw =
    typeof parsed.mitreTechnique === "string" ? parsed.mitreTechnique : null;
  const triage: IncidentTriageResult = {
    mitreTactic: normalizeTactic(mitreTacticRaw),
    mitreTactics: Array.isArray(parsed.mitreTactics)
      ? filterValidTactics(
          (parsed.mitreTactics as unknown[]).filter(
            (x): x is string => typeof x === "string",
          ),
        ).slice(0, 5)
      : [],
    mitreTechnique: normalizeTechnique(mitreTechniqueRaw),
    mitreTechniques: Array.isArray(parsed.mitreTechniques)
      ? filterValidTechniques(
          (parsed.mitreTechniques as unknown[]).filter(
            (x): x is string => typeof x === "string",
          ),
        ).slice(0, 5)
      : [],
    suggestedSeverity: pickEnum(parsed.suggestedSeverity, SEVERITY_OPTIONS),
    falsePositiveProbability: clampProb(parsed.falsePositiveProbability),
    urgency: pickEnum(parsed.urgency, URGENCY_OPTIONS) ?? "normal",
    actionCategory:
      pickEnum(parsed.actionCategory, CATEGORY_OPTIONS) ?? "investigate",
    confidence: clampProb(parsed.confidence),
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    recommendedActions: actions,
    invocationId: result.invocationId,
  };

  return triage;
}
