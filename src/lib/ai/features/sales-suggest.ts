// ============================================================================
// AI SALES SUGGESTIONS — Phase 3 #9.
//
// À partir des signaux opérationnels d'un client, extrait des opportunités
// projets / services récurrents — NON pour "vendre à tout prix", mais pour
// exposer des besoins réels que les incidents révèlent. Ex :
//   - Incidents répétés de comptes compromis → projet MFA + revue accès
//   - Parc vieillissant (EOL) → plan de renouvellement
//   - Problèmes d'impression chroniques → standardisation + audit
//   - Incidents VPN fréquents → migration SD-WAN ou modernisation réseau
//
// Ce feature est une AIDE À L'ANALYSE commerciale — l'équipe vente utilise
// les suggestions comme points de discussion avec le client. Les
// suggestions ne sont JAMAIS envoyées au client telles quelles.
// ============================================================================

import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_SALES_SUGGEST } from "@/lib/ai/orchestrator/policies";
import { collectOrgSignals } from "./signals";

export interface SalesOpportunity {
  /** Titre commercial (pas technique). */
  title: string;
  /** Type de service MSP. */
  category:
    | "security"
    | "backup_dr"
    | "infrastructure_modernization"
    | "endpoint_management"
    | "network"
    | "consulting"
    | "training"
    | "compliance"
    | "other";
  /** Quels problèmes ce projet résoudrait. */
  problemEvidence: string[];
  /** Valeur business pour le client (pas pour Cetix). */
  clientValue: string;
  /** Niveau de confiance que c'est une vraie opportunité. */
  confidence: "low" | "medium" | "high";
  /** Effort d'investissement estimé pour le client. */
  clientEffort: "low" | "medium" | "high";
  /** Récurrence possible ? (service managé récurrent vs projet ponctuel) */
  recurring: boolean;
}

export interface SalesSuggestions {
  organizationId: string;
  organizationName: string;
  opportunities: SalesOpportunity[];
  generatedAt: string;
}

export async function suggestSalesOpportunities(args: {
  organizationId: string;
  sinceDays?: number;
}): Promise<SalesSuggestions | null> {
  try {
    const signals = await collectOrgSignals({
      organizationId: args.organizationId,
      sinceDays: args.sinceDays ?? 90,
    });
    if (!signals) return null;

    const system = `Tu es un consultant MSP qui analyse la situation opérationnelle d'un client pour identifier des opportunités de projets ou services récurrents qui résoudraient de VRAIS problèmes observés dans les données.

Tu réponds EXCLUSIVEMENT en JSON strict, format :
{
  "opportunities": [
    {
      "title": "Titre commercial",
      "category": "security|backup_dr|infrastructure_modernization|endpoint_management|network|consulting|training|compliance|other",
      "problemEvidence": ["problème observé 1", "problème observé 2"],
      "clientValue": "ce que ce projet apporte au CLIENT (pas à Cetix)",
      "confidence": "low|medium|high",
      "clientEffort": "low|medium|high",
      "recurring": true|false
    }
  ]
}

Règles strictes :
- 2-6 opportunités maximum. Préférer 3 solides à 6 tièdes.
- Chaque opportunité doit s'appuyer sur des CHIFFRES ou observations dans les données — pas d'invention.
- clientValue : bénéfice pour le client (continuité, sécurité, économie de temps). Pas de vocabulaire commercial agressif.
- confidence "high" : un problème majeur est clairement démontré par les chiffres.
- confidence "low" : intuition basée sur un signal faible — à valider.
- recurring : true si c'est un service managé récurrent, false si projet ponctuel.
- Si rien de sérieux n'émerge → {"opportunities": []}. Ne pas forcer.`;

    const user = `Client : ${signals.organizationName}
Période analysée : ${signals.sinceDays} derniers jours

=== CE QU'ON OBSERVE ===
Tickets : ${signals.tickets.total} (tendance ${signals.tickets.trendVsPrevious != null ? signals.tickets.trendVsPrevious + "%" : "—"})
Top catégories : ${signals.tickets.byCategory
      .slice(0, 5)
      .map((c) => `${c.name}=${c.count}`)
      .join(", ")}
Tickets SLA breachés : ${signals.tickets.slaBreached}
Tickets escaladés : ${signals.tickets.escalated}

Sécurité : ${signals.security.total} incidents
Par type : ${Object.entries(signals.security.byKind)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}
Top endpoints touchés : ${signals.security.topEndpoints
      .map((e) => `${e.endpoint}=${e.count}`)
      .join(", ")}

Sauvegardes : ${signals.backups.failed}/${signals.backups.total} échecs
Top jobs qui échouent : ${signals.backups.topFailingJobs
      .map((j) => `${j.job}=${j.count}`)
      .join(", ")}

Monitoring : ${signals.monitoring.total} alertes (${signals.monitoring.unresolved} non résolues)
Par source : ${Object.entries(signals.monitoring.bySource)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}

Parc : ${signals.assets.total} actifs, ${signals.assets.warrantyExpired} garanties expirées, ${signals.assets.warrantyExpiringSoon} expirent < 90j

Faits connus sur ce client :
${
  signals.extractedFacts.length === 0
    ? "(aucun)"
    : signals.extractedFacts.map((f) => `[${f.kind}${f.verified ? "" : ", non vérifié"}] ${f.content}`).join("\n")
}`;

    const result = await runAiTask({
      policy: POLICY_SALES_SUGGEST,
      context: { organizationId: signals.organizationId },
      taskKind: "extraction",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    const parsed = parseJson(result.content);
    if (!parsed || !Array.isArray(parsed.opportunities)) {
      return {
        organizationId: signals.organizationId,
        organizationName: signals.organizationName,
        opportunities: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const opportunities: SalesOpportunity[] = (parsed.opportunities as unknown[])
      .map((x) => normalizeOpportunity(x))
      .filter((x): x is SalesOpportunity => x !== null)
      .slice(0, 8);

    return {
      organizationId: signals.organizationId,
      organizationName: signals.organizationName,
      opportunities,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(
      `[ai-sales-suggest] org ${args.organizationId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function normalizeOpportunity(x: unknown): SalesOpportunity | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const title = String(o.title ?? "").trim();
  if (!title) return null;
  const catRaw = String(o.category ?? "other").toLowerCase();
  const validCats = [
    "security",
    "backup_dr",
    "infrastructure_modernization",
    "endpoint_management",
    "network",
    "consulting",
    "training",
    "compliance",
    "other",
  ];
  const category = (validCats.includes(catRaw) ? catRaw : "other") as SalesOpportunity["category"];
  return {
    title: title.slice(0, 160),
    category,
    problemEvidence: Array.isArray(o.problemEvidence)
      ? (o.problemEvidence as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 5)
      : [],
    clientValue: String(o.clientValue ?? "").slice(0, 300),
    confidence:
      o.confidence === "high" || o.confidence === "low"
        ? (o.confidence as "high" | "low")
        : "medium",
    clientEffort:
      o.clientEffort === "high" || o.clientEffort === "low"
        ? (o.clientEffort as "high" | "low")
        : "medium",
    recurring: !!o.recurring,
  };
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
