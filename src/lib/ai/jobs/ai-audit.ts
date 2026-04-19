// ============================================================================
// AI AUDIT — feedback loop autonome pour améliorer la qualité du modèle
// local (gemma3) via un juge plus intelligent (OpenAI gpt-4o-mini).
//
// Flux :
//   1. Sample N AiInvocations récentes non encore auditées (features visées :
//      triage, category_suggest, response_assist).
//   2. Pour chacune, bâtit un prompt "le modèle X a classé ce ticket en Y,
//      est-ce juste ?" et envoie au juge.
//   3. Stocke le verdict dans AiAuditResult.
//   4. AGRÈGE les suggestions : si la même règle apparaît ≥ AUTO_APPLY_THRESHOLD
//      fois sur une fenêtre, l'applique AUTOMATIQUEMENT en écrivant dans
//      AiPattern (scope="learned:triage", etc.). Les features lisent ensuite
//      ces patterns à chaque appel pour ajuster leur comportement.
//
// 100% autonome, aucune intervention humaine requise. Les admins peuvent
// inspecter les résultats dans Paramètres > Intelligence IA > Audit.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask, tryParseJson } from "@/lib/ai/orchestrator";
import { POLICY_AI_AUDIT } from "@/lib/ai/orchestrator/policies";

const MAX_BATCH = 15;
const AUDITED_FEATURES = ["triage", "category_suggest", "priority_suggest"];
const AUTO_APPLY_THRESHOLD = 3;
// TTL des patterns auto-appliqués : 90 jours. Sans expiration, un pattern
// appris pendant une période bruyante (ex: bug temporaire côté provider)
// deviendrait règle permanente. Après 90j, le pattern expire → le learner
// devra le ré-accumuler s'il reste pertinent. Les patterns ajoutés
// manuellement par un admin ne sont pas concernés (ils n'ont pas scope
// "learned:*" et n'ont pas d'expiresAt).
const AUTO_LEARNED_TTL_DAYS = 90;

interface JudgeResult {
  verdict: "agree" | "disagree" | "partial";
  confidence: number;
  reasoning: string;
  suggestion?: {
    /**
     * Type d'amélioration proposée — doit matcher les kinds gérés par
     * l'applier (voir applyLearnedPatterns). Les unknowns sont loggés mais
     * pas appliqués automatiquement.
     */
    kind:
      | "add_sanity_stop"      // ajouter un mot à la liste des mots trop génériques
      | "category_mapping"     // associer un mot-clé à une catégorie préférée
      | "confidence_penalty"   // baisser la confiance pour un pattern donné
      | "other";
    /** Payload spécifique au kind — string simple ou clé:valeur. */
    data: string;
    /** Justification — pour traçabilité dans AiPattern. */
    why: string;
  };
  correctCategoryId?: string;
}

/**
 * Run d'audit — non throw, log les erreurs. Retourne des stats.
 */
export async function runAiAudit(): Promise<{
  audited: number;
  agreed: number;
  disagreed: number;
  partial: number;
  errors: number;
  autoApplied: number;
}> {
  const stats = {
    audited: 0,
    agreed: 0,
    disagreed: 0,
    partial: 0,
    errors: 0,
    autoApplied: 0,
  };

  // Sélection : invocations des 24 dernières heures, des features auditées,
  // avec un contenu (réponse), non encore auditées.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alreadyAudited = await prisma.aiAuditResult.findMany({
    where: { createdAt: { gte: since } },
    select: { invocationId: true },
  });
  const auditedIds = new Set(alreadyAudited.map((a) => a.invocationId));

  const candidates = await prisma.aiInvocation.findMany({
    where: {
      feature: { in: AUDITED_FEATURES },
      status: "ok",
      response: { not: null },
      createdAt: { gte: since },
      id: { notIn: Array.from(auditedIds) },
    },
    select: {
      id: true,
      feature: true,
      ticketId: true,
      response: true,
      modelName: true,
      provider: true,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_BATCH,
  });

  for (const inv of candidates) {
    try {
      // Contexte minimal : recharge le ticket si dispo pour que le juge
      // voie l'input original (sujet + description).
      const ticket = inv.ticketId
        ? await prisma.ticket.findUnique({
            where: { id: inv.ticketId },
            select: {
              subject: true,
              description: true,
              category: { select: { name: true } },
            },
          })
        : null;

      const audit = await auditInvocation({
        feature: inv.feature,
        ticketSubject: ticket?.subject ?? "",
        ticketDescription: ticket?.description ?? "",
        currentCategoryName: ticket?.category?.name ?? null,
        localModelResponse: inv.response ?? "",
        localModel: `${inv.provider}/${inv.modelName}`,
      });

      if (!audit) {
        stats.errors++;
        continue;
      }

      await prisma.aiAuditResult.create({
        data: {
          invocationId: inv.id,
          feature: inv.feature,
          verdict: audit.verdict,
          judgeConfidence: audit.confidence,
          judgeModel: "openai/gpt-4o-mini",
          reasoning: audit.reasoning.slice(0, 2000),
          suggestion: audit.suggestion
            ? `[${audit.suggestion.kind}] ${audit.suggestion.data} — ${audit.suggestion.why}`.slice(0, 1000)
            : null,
          correctCategoryId: audit.correctCategoryId ?? null,
          auditCostCents: null,
        },
      });

      stats.audited++;
      if (audit.verdict === "agree") stats.agreed++;
      else if (audit.verdict === "disagree") stats.disagreed++;
      else stats.partial++;
    } catch (err) {
      console.warn(
        `[ai-audit] invocation ${inv.id} failed:`,
        err instanceof Error ? err.message : String(err),
      );
      stats.errors++;
    }
  }

  // Aggrégation autonome : après avoir audité ce batch, inspecte les
  // suggestions sur les 7 derniers jours et applique celles qui reviennent.
  const applied = await applyLearnedPatterns();
  stats.autoApplied = applied;

  return stats;
}

// ---------------------------------------------------------------------------
// Audit individuel — appel du juge
// ---------------------------------------------------------------------------

async function auditInvocation(args: {
  feature: string;
  ticketSubject: string;
  ticketDescription: string;
  currentCategoryName: string | null;
  localModelResponse: string;
  localModel: string;
}): Promise<JudgeResult | null> {
  const system = `Tu es un auditeur IA expert pour un MSP. Un modèle local (${args.localModel}) a produit une classification sur un ticket — ta mission est de vérifier si elle est JUSTE et de suggérer une amélioration concrète si elle est fausse.

Réponds EXCLUSIVEMENT en JSON strict :
{
  "verdict": "agree" | "disagree" | "partial",
  "confidence": 0.0-1.0,
  "reasoning": "1-3 phrases en français expliquant le verdict",
  "suggestion": null | {
    "kind": "add_sanity_stop" | "category_mapping" | "confidence_penalty" | "other",
    "data": "string (selon kind : mot à ajouter, 'keyword:categoryName', etc.)",
    "why": "raison courte"
  },
  "correctCategoryId": "uniquement si tu connais l'ID correct (rare)"
}

Règles :
- "agree" : la classification est correcte et la confiance est raisonnable.
- "disagree" : la catégorie/priorité choisie est manifestement fausse.
- "partial" : directionnellement correct mais imprécis (ex: bon parent, mauvaise feuille).

Types de suggestions :
- "add_sanity_stop" : data = mot (ex: "courriel") qui est trop générique et cause des faux matchs.
- "category_mapping" : data = "keyword:categoryName" (ex: "phishing:Phishing / Hameçonnage") pour forcer un mapping.
- "confidence_penalty" : data = pattern textuel qui devrait baisser la confiance (ex: "microsoft seul sans autre mot").
- "other" : insuffisant pour auto-apply, informatif seulement.`;

  const user = `# Ticket
Sujet : ${args.ticketSubject || "(vide)"}
Description : ${(args.ticketDescription || "").slice(0, 1500)}

# Décision du modèle local
Catégorie courante sur le ticket : ${args.currentCategoryName || "(aucune)"}
Réponse brute du modèle local :
${args.localModelResponse.slice(0, 2000)}

# Ta tâche
Audite cette décision. Est-elle correcte ? Si non, suggère UNE amélioration concrète et actionnable.`;

  const res = await runAiTask({
    policy: POLICY_AI_AUDIT,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: "classification",
  });

  if (!res.ok || !res.content) return null;
  const parsed = tryParseJson<Record<string, unknown>>(res.content);
  if (!parsed) return null;

  const verdict =
    parsed.verdict === "agree" || parsed.verdict === "disagree" || parsed.verdict === "partial"
      ? (parsed.verdict as JudgeResult["verdict"])
      : null;
  if (!verdict) return null;

  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";
  const correctCategoryId =
    typeof parsed.correctCategoryId === "string"
      ? parsed.correctCategoryId
      : undefined;

  let suggestion: JudgeResult["suggestion"] = undefined;
  const s = parsed.suggestion as Record<string, unknown> | null | undefined;
  if (s && typeof s === "object") {
    const kind =
      s.kind === "add_sanity_stop" ||
      s.kind === "category_mapping" ||
      s.kind === "confidence_penalty" ||
      s.kind === "other"
        ? (s.kind as NonNullable<JudgeResult["suggestion"]>["kind"])
        : null;
    const data = typeof s.data === "string" ? s.data.slice(0, 200) : "";
    const why = typeof s.why === "string" ? s.why.slice(0, 300) : "";
    if (kind && data) suggestion = { kind, data, why };
  }

  return { verdict, confidence, reasoning, suggestion, correctCategoryId };
}

// ---------------------------------------------------------------------------
// AUTO-APPLIQUER les patterns appris
//
// Règle : une suggestion qui revient ≥ AUTO_APPLY_THRESHOLD fois sur 7 jours
// est persistée dans AiPattern (scope="learned:triage") et lue à chaque
// invocation des features concernées. Les features ne lisent PAS AiPattern
// en boucle serrée : cache in-memory de 5 min (pattern-cache.ts).
// ---------------------------------------------------------------------------

export async function applyLearnedPatterns(): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const results = await prisma.aiAuditResult.findMany({
    where: {
      createdAt: { gte: since },
      verdict: { in: ["disagree", "partial"] },
      suggestion: { not: null },
    },
    select: { suggestion: true, feature: true },
  });

  // Compte les suggestions identiques.
  // Suggestion = "[kind] data — why" (format écrit ci-dessus).
  const counts = new Map<string, { count: number; feature: string; raw: string }>();
  for (const r of results) {
    if (!r.suggestion) continue;
    const m = r.suggestion.match(/^\[(add_sanity_stop|category_mapping|confidence_penalty|other)\]\s+([^—]+)—/);
    if (!m) continue;
    const kind = m[1];
    const data = m[2].trim().toLowerCase();
    // Skip "other" → pas auto-applicable.
    if (kind === "other") continue;
    const key = `${r.feature}|${kind}|${data}`;
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { count: 1, feature: r.feature, raw: `${kind}:${data}` });
  }

  // Pour chaque suggestion à seuil, upsert dans AiPattern.
  let applied = 0;
  for (const [key, v] of counts) {
    if (v.count < AUTO_APPLY_THRESHOLD) continue;
    const [feature, kind, data] = key.split("|");
    const patternKey = `${kind}:${data}`;
    try {
      // TTL glissant : chaque upsert remet l'expiration à +90j. Un pattern
      // confirmé régulièrement par le juge ne expirera jamais en pratique.
      // Un pattern qui disparaît (le learner ne le re-voit plus) finira par
      // expirer et ne plus influencer les décisions — auto-nettoyage.
      const expiresAt = new Date(
        Date.now() + AUTO_LEARNED_TTL_DAYS * 24 * 60 * 60 * 1000,
      );
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: `learned:${feature}`,
            kind,
            key: patternKey,
          },
        },
        create: {
          scope: `learned:${feature}`,
          kind,
          key: patternKey,
          value: { data, occurrences: v.count } as never,
          sampleCount: v.count,
          confidence: Math.min(1, v.count / 10),
          expiresAt,
        },
        update: {
          value: { data, occurrences: v.count } as never,
          sampleCount: v.count,
          confidence: Math.min(1, v.count / 10),
          expiresAt,
        },
      });
      applied++;
      console.log(
        `[ai-audit] auto-apprentissage : pattern '${kind}' pour ${feature} → '${data}' (×${v.count})`,
      );
    } catch (err) {
      console.warn(`[ai-audit] échec write AiPattern pour ${key}:`, err);
    }
  }

  return applied;
}

// ---------------------------------------------------------------------------
// Helper public : charge les patterns appris pour une feature.
// ---------------------------------------------------------------------------

interface LearnedPatterns {
  sanityStops: Set<string>;
  categoryMappings: Array<{ keyword: string; category: string }>;
  confidencePenalties: string[];
}

let cache: { at: number; byFeature: Map<string, LearnedPatterns> } = {
  at: 0,
  byFeature: new Map(),
};
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getLearnedPatterns(feature: string): Promise<LearnedPatterns> {
  if (Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.byFeature.get(feature) ?? { sanityStops: new Set(), categoryMappings: [], confidencePenalties: [] };
  }

  // Rebuild cache global pour toutes les features apprises.
  // Le meta-learning peut avoir marqué certains patterns "harmful" — on les
  // filtre ici pour qu'ils soient automatiquement retirés sans suppression.
  const { isPatternHarmful } = await import("@/lib/ai/jobs/meta-learning");
  // Filtre les patterns expirés : un pattern appris il y a > 90j sans
  // re-confirmation du learner est considéré obsolète. L'ai-audit.ts set
  // expiresAt à chaque upsert → un pattern confirmé régulièrement reste frais.
  const now = new Date();
  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: { startsWith: "learned:" },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { scope: true, kind: true, key: true, value: true },
  });
  const next = new Map<string, LearnedPatterns>();
  for (const r of rows) {
    if (isPatternHarmful(r.value)) continue;
    const f = r.scope.replace(/^learned:/, "");
    const lp = next.get(f) ?? {
      sanityStops: new Set<string>(),
      categoryMappings: [] as Array<{ keyword: string; category: string }>,
      confidencePenalties: [] as string[],
    };
    const data =
      typeof r.value === "object" && r.value !== null && "data" in r.value
        ? String((r.value as { data: unknown }).data)
        : "";
    if (r.kind === "add_sanity_stop") {
      lp.sanityStops.add(data);
    } else if (r.kind === "category_mapping") {
      const [keyword, category] = data.split(":").map((s) => s.trim());
      if (keyword && category) lp.categoryMappings.push({ keyword, category });
    } else if (r.kind === "confidence_penalty") {
      lp.confidencePenalties.push(data);
    }
    next.set(f, lp);
  }
  cache = { at: Date.now(), byFeature: next };
  return next.get(feature) ?? { sanityStops: new Set(), categoryMappings: [], confidencePenalties: [] };
}
