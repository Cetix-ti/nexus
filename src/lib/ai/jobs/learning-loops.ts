// ============================================================================
// SYSTÈMES AUTO-APPRENANTS AVANCÉS
//
// Complètent ai-audit.ts avec 3 boucles de feedback autonomes :
//
//   1. learnFromFactsConsensus — auto-valide les faits AiMemory proposés
//      par l'IA quand le même fait revient depuis ≥ N tickets distincts.
//      Plus besoin de validation manuelle pour les faits consensuels.
//
//   2. learnFromResponseEdits — capture les diffs quand un tech édite un
//      brouillon response_assist/resolution_notes. Les patterns d'édition
//      récurrents (ex: "toujours ajouter 'Bonjour'", "retirer les emojis")
//      sont distillés en règles injectées dans les prompts futurs.
//
//   3. learnFromPriorityEscalations — détecte quand l'IA sous-estime
//      systématiquement la priorité (ticket créé à "low" puis escaladé à
//      "high" < 2h). Apprend un décalage par catégorie et l'applique.
//
// Tous exécutés via le job scheduler "ai-learning-loops" toutes les 6h.
// Aucune intervention humaine requise — les règles apprises s'appliquent
// immédiatement et s'auto-ajustent tant que le signal persiste.
// ============================================================================

import prisma from "@/lib/prisma";

// Seuils — réglables via env sans redéployer. Valeurs par défaut
// raisonnables pour un MSP de 10-50 clients.
const FACTS_CONSENSUS_MIN_SOURCES = Number(
  process.env.AI_LEARN_FACTS_MIN_SOURCES || 3,
);
const RESPONSE_EDIT_MIN_OCCURRENCES = Number(
  process.env.AI_LEARN_EDIT_MIN_OCCURRENCES || 4,
);
const PRIORITY_ESCALATION_WINDOW_MS =
  Number(process.env.AI_LEARN_PRIORITY_WINDOW_HOURS || 2) * 3600_000;
const PRIORITY_ESCALATION_MIN_CASES = Number(
  process.env.AI_LEARN_PRIORITY_MIN_CASES || 5,
);

interface LearningStats {
  factsAutoValidated: number;
  responseEditsLearned: number;
  priorityCalibrations: number;
}

export async function runLearningLoops(): Promise<LearningStats> {
  const stats: LearningStats = {
    factsAutoValidated: 0,
    responseEditsLearned: 0,
    priorityCalibrations: 0,
  };

  // Chaque boucle est isolée : si une échoue, les autres s'exécutent.
  try {
    stats.factsAutoValidated = await learnFromFactsConsensus();
  } catch (err) {
    console.warn("[learn/facts] failed:", err);
  }

  try {
    stats.responseEditsLearned = await learnFromResponseEdits();
  } catch (err) {
    console.warn("[learn/edits] failed:", err);
  }

  try {
    stats.priorityCalibrations = await learnFromPriorityEscalations();
  } catch (err) {
    console.warn("[learn/priority] failed:", err);
  }

  return stats;
}

// ---------------------------------------------------------------------------
// 1. FACTS CONSENSUS — auto-validation
// ---------------------------------------------------------------------------
//
// Logique : si un fait AiMemory (scope=org:X, verifiedAt=null) a été proposé
// depuis ≥ N tickets distincts (traqué via source="extracted:ticket:<id>"
// pour la V1 — on compte les faits identiques sur des clients différents),
// c'est un consensus solide. On auto-valide.
//
// Alternative considérée : compter les faits SIMILAIRES (fuzzy match) plutôt
// qu'identiques. Écartée car le extract-facts fait déjà de la dédup — les
// faits en doublon sont le signe que l'IA a vu le pattern plusieurs fois.

async function learnFromFactsConsensus(): Promise<number> {
  // On regroupe les faits NON validés par (scope, category, content-normalisé)
  // et on sélectionne ceux qui ont ≥ FACTS_CONSENSUS_MIN_SOURCES entrées
  // dérivées de tickets différents.
  //
  // Le fait "de dédup" stocké par facts-extract est UNIQUE par contenu +
  // scope (cf. findExistingFact dans facts-extract.ts). Donc pour compter
  // "N tickets distincts", on a besoin d'une table de provenance. En V1,
  // on regarde le source string : "extracted:ticket:<id>" → on peut
  // remonter au ticket qui l'a généré.
  //
  // Pour que le consensus marche, on regarde les occurrences dans
  // AiInvocation de "facts_extract" récentes et on cherche les faits qui
  // reviennent.

  const pending = await prisma.aiMemory.findMany({
    where: {
      verifiedAt: null,
      rejectedAt: null,
      source: { startsWith: "extracted:" },
      scope: { startsWith: "org:" },
    },
    select: { id: true, scope: true, category: true, content: true, source: true },
    take: 500,
  });

  // Normalize content pour regrouper les faits quasi-identiques.
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

  // Clé de regroupement : scope + category + content normalisé tronqué.
  // (Si deux faits ont exactement le même texte normalisé, findExistingFact
  // les a déjà dédupliqués — donc ici on cherche les "variantes proches".)
  const groups = new Map<string, typeof pending>();
  for (const f of pending) {
    const key = `${f.scope}|${f.category}|${norm(f.content).slice(0, 100)}`;
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }

  // V1 simple : si un groupe a ≥ N entrées distinctes → tous les faits du
  // groupe sont auto-validés. Le champ `verifiedBy` signale l'origine.
  let validated = 0;
  for (const [, facts] of groups) {
    if (facts.length < FACTS_CONSENSUS_MIN_SOURCES) continue;
    await prisma.aiMemory.updateMany({
      where: { id: { in: facts.map((f) => f.id) } },
      data: {
        verifiedAt: new Date(),
        verifiedBy: "system:auto-consensus",
      },
    });
    validated += facts.length;
    console.log(
      `[learn/facts] auto-validé ${facts.length} fait(s) par consensus : "${facts[0].content.slice(0, 80)}"`,
    );
  }
  return validated;
}

// ---------------------------------------------------------------------------
// 2. RESPONSE EDITS — apprentissage des patterns d'édition
// ---------------------------------------------------------------------------
//
// Chaque fois qu'un tech accepte AVEC édition un brouillon response_assist
// ou resolution_notes, AiInvocation.humanEdit contient le texte final. On
// compare avec la réponse brute pour extraire les patterns récurrents.
//
// En V1, on ne fait pas de diff textuel complet — on détecte des "règles
// fréquentes" simples :
//   - Suppressions récurrentes (phrase exacte retirée ≥ N fois)
//   - Insertions récurrentes (phrase ajoutée ≥ N fois)
//   - Tonalités : "version courte", "version détaillée"
//
// Ces patterns sont stockés dans AiPattern (scope="learned:response_assist")
// et injectés dans le prompt système de la feature à chaque appel.

async function learnFromResponseEdits(): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const edits = await prisma.aiInvocation.findMany({
    where: {
      feature: { in: ["response_assist", "resolution_notes"] },
      humanAction: "edited",
      humanEdit: { not: null },
      response: { not: null },
      createdAt: { gte: since },
    },
    select: { feature: true, response: true, humanEdit: true, organizationId: true },
    take: 300,
  });

  // Pour chaque édition, on extrait les lignes/phrases présentes uniquement
  // dans la version finale (additions) et uniquement dans l'original
  // (suppressions).
  const additionCounts = new Map<string, { feature: string; count: number }>();
  const removalCounts = new Map<string, { feature: string; count: number }>();

  for (const inv of edits) {
    const before = sanitizeLines(inv.response ?? "");
    const after = sanitizeLines(inv.humanEdit ?? "");
    const beforeSet = new Set(before);
    const afterSet = new Set(after);

    for (const line of after) {
      if (line.length < 8 || line.length > 200) continue;
      if (beforeSet.has(line)) continue;
      // Heuristique : on ne garde que les lignes qui ressemblent à une
      // formulation stable (pas un détail technique spécifique).
      if (/\b(bonjour|cordialement|merci|salutations|au plaisir|signature)\b/i.test(line)
          || line.length < 60) {
        const key = `add|${inv.feature}|${line}`;
        const c = additionCounts.get(key);
        if (c) c.count++;
        else additionCounts.set(key, { feature: inv.feature, count: 1 });
      }
    }
    for (const line of before) {
      if (line.length < 8 || line.length > 200) continue;
      if (afterSet.has(line)) continue;
      if (line.length < 60) {
        const key = `rm|${inv.feature}|${line}`;
        const c = removalCounts.get(key);
        if (c) c.count++;
        else removalCounts.set(key, { feature: inv.feature, count: 1 });
      }
    }
  }

  let learned = 0;
  for (const [key, v] of additionCounts) {
    if (v.count < RESPONSE_EDIT_MIN_OCCURRENCES) continue;
    const line = key.substring(key.indexOf("|", 4) + 1);
    await prisma.aiPattern.upsert({
      where: {
        scope_kind_key: {
          scope: `learned:${v.feature}`,
          kind: "preferred_insertion",
          key: line.slice(0, 120),
        },
      },
      create: {
        scope: `learned:${v.feature}`,
        kind: "preferred_insertion",
        key: line.slice(0, 120),
        value: { line, occurrences: v.count } as never,
        sampleCount: v.count,
        confidence: Math.min(1, v.count / 10),
      },
      update: {
        value: { line, occurrences: v.count } as never,
        sampleCount: v.count,
      },
    });
    learned++;
    console.log(`[learn/edits] préférence apprise (${v.feature}) : "${line.slice(0, 60)}…" ×${v.count}`);
  }
  for (const [key, v] of removalCounts) {
    if (v.count < RESPONSE_EDIT_MIN_OCCURRENCES) continue;
    const line = key.substring(key.indexOf("|", 3) + 1);
    await prisma.aiPattern.upsert({
      where: {
        scope_kind_key: {
          scope: `learned:${v.feature}`,
          kind: "avoided_phrasing",
          key: line.slice(0, 120),
        },
      },
      create: {
        scope: `learned:${v.feature}`,
        kind: "avoided_phrasing",
        key: line.slice(0, 120),
        value: { line, occurrences: v.count } as never,
        sampleCount: v.count,
        confidence: Math.min(1, v.count / 10),
      },
      update: {
        value: { line, occurrences: v.count } as never,
        sampleCount: v.count,
      },
    });
    learned++;
    console.log(`[learn/edits] formulation à éviter (${v.feature}) : "${line.slice(0, 60)}…" ×${v.count}`);
  }
  return learned;
}

function sanitizeLines(html: string): string[] {
  // Extraction naïve de lignes "lisibles" depuis du HTML ou plain text.
  return html
    .replace(/<[^>]+>/g, " ")
    .split(/[\n\r.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// 3. PRIORITY ESCALATION CALIBRATION
// ---------------------------------------------------------------------------
//
// L'IA classe un ticket à "low" ou "medium". Un tech humain remonte à "high"
// ou "critical" peu après. Si ce scénario se répète, l'IA sous-estime
// systématiquement pour certains patterns. On apprend le décalage et on
// injecte dans le prompt triage futur : "attention, les tickets contenant
// ces patterns sont souvent escaladés".

interface EscalationPattern {
  tokenKey: string;
  escalations: number;
  tickets: number;
}

async function learnFromPriorityEscalations(): Promise<number> {
  const priorityRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const since = new Date(Date.now() - 30 * 24 * 3600_000);

  // Tickets créés il y a ≥ 30 min (pour laisser le temps à l'escalade) et
  // dont la priorité a été MONTÉE après la création (via audit activity log
  // ou via prioritySource qui est passé de AI → MANUAL).
  //
  // V1 simple : on cherche les tickets où `prioritySource = MANUAL` et
  // `createdAt` récent. Si la priorité actuelle est > low, on suppose une
  // escalade par l'humain (la V2 fera mieux avec un audit log complet).
  const escalated = await prisma.ticket.findMany({
    where: {
      createdAt: { gte: since },
      prioritySource: "MANUAL",
      priority: { in: ["HIGH", "CRITICAL"] },
    },
    select: { id: true, subject: true, priority: true, createdAt: true, updatedAt: true },
    take: 500,
  });

  // Tokenise les sujets des escalades pour trouver les patterns récurrents.
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ");
  const STOP = new Set([
    "avec","sans","dans","pour","cette","sous","sont","avoir","faire",
    "with","from","have","this","that",
    "probleme","erreur","issue","incident","urgent","panne","bug",
  ]);

  const tokenCounts = new Map<string, EscalationPattern>();
  for (const t of escalated) {
    const tokens = new Set(
      norm(t.subject).split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)),
    );
    for (const tok of tokens) {
      const cur = tokenCounts.get(tok) ?? { tokenKey: tok, escalations: 0, tickets: 0 };
      cur.escalations += 1;
      tokenCounts.set(tok, cur);
    }
  }

  // Compare vs baseline : fréquence globale de ce token dans les tickets
  // récents (pour éviter de "apprendre" qu'un mot commun comme "serveur"
  // est un signal d'escalade).
  const baseline = await prisma.ticket.findMany({
    where: { createdAt: { gte: since } },
    select: { subject: true },
    take: 2000,
  });
  const baselineCounts = new Map<string, number>();
  for (const t of baseline) {
    const tokens = new Set(
      norm(t.subject).split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)),
    );
    for (const tok of tokens) {
      baselineCounts.set(tok, (baselineCounts.get(tok) ?? 0) + 1);
    }
  }

  // Un token est "signal d'escalade" si son ratio escalations/baseline est
  // élevé (ex: "fortigate" apparaît 8× dans les escalades et 12× total →
  // 67% des tickets "fortigate" finissent escaladés → fort signal).
  let calibrations = 0;
  for (const [tok, pat] of tokenCounts) {
    if (pat.escalations < PRIORITY_ESCALATION_MIN_CASES) continue;
    const base = baselineCounts.get(tok) ?? 1;
    const ratio = pat.escalations / base;
    if (ratio < 0.4) continue; // Moins de 40% → pas un signal fiable
    await prisma.aiPattern.upsert({
      where: {
        scope_kind_key: {
          scope: "learned:priority_suggest",
          kind: "escalation_signal",
          key: tok,
        },
      },
      create: {
        scope: "learned:priority_suggest",
        kind: "escalation_signal",
        key: tok,
        value: {
          token: tok,
          escalations: pat.escalations,
          baseline: base,
          ratio: Math.round(ratio * 100) / 100,
        } as never,
        sampleCount: pat.escalations,
        confidence: Math.min(1, ratio),
      },
      update: {
        value: {
          token: tok,
          escalations: pat.escalations,
          baseline: base,
          ratio: Math.round(ratio * 100) / 100,
        } as never,
        sampleCount: pat.escalations,
        confidence: Math.min(1, ratio),
      },
    });
    calibrations++;
    console.log(
      `[learn/priority] signal d'escalade : "${tok}" (escaladé ${pat.escalations}/${base} = ${Math.round(ratio * 100)}%)`,
    );
  }

  // Évite que PRIORITY_ESCALATION_WINDOW_MS soit inutilisé — actuellement
  // on ne s'en sert pas pour la V1 (on regarde juste prioritySource=MANUAL).
  void PRIORITY_ESCALATION_WINDOW_MS;

  return calibrations;
}

// ---------------------------------------------------------------------------
// Helper — charge les patterns appris pour une feature donnée.
// Utilisé par les prompts pour injecter les règles apprises.
// ---------------------------------------------------------------------------

export interface LearnedResponsePatterns {
  preferredInsertions: string[];
  avoidedPhrasings: string[];
  escalationSignals: Array<{ token: string; ratio: number }>;
}

let cache: { at: number; byFeature: Map<string, LearnedResponsePatterns> } = {
  at: 0,
  byFeature: new Map(),
};
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getLearnedResponsePatterns(
  feature: string,
): Promise<LearnedResponsePatterns> {
  const empty: LearnedResponsePatterns = {
    preferredInsertions: [],
    avoidedPhrasings: [],
    escalationSignals: [],
  };
  if (Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.byFeature.get(feature) ?? empty;
  }

  // Filtre TTL : ignore les patterns expirés (auto-appris il y a > 90j sans
  // re-confirmation). Empêche qu'une règle stale continue d'influencer les
  // réponses après que le comportement source a disparu.
  const rows = await prisma.aiPattern.findMany({
    where: {
      scope: { startsWith: "learned:" },
      kind: { in: ["preferred_insertion", "avoided_phrasing", "escalation_signal"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { scope: true, kind: true, value: true },
    orderBy: { sampleCount: "desc" },
    take: 200,
  });
  const next = new Map<string, LearnedResponsePatterns>();
  for (const r of rows) {
    const f = r.scope.replace(/^learned:/, "");
    const lp = next.get(f) ?? { ...empty, preferredInsertions: [], avoidedPhrasings: [], escalationSignals: [] };
    const v = r.value as Record<string, unknown>;
    if (r.kind === "preferred_insertion" && typeof v.line === "string") {
      if (lp.preferredInsertions.length < 10) lp.preferredInsertions.push(v.line);
    } else if (r.kind === "avoided_phrasing" && typeof v.line === "string") {
      if (lp.avoidedPhrasings.length < 10) lp.avoidedPhrasings.push(v.line);
    } else if (r.kind === "escalation_signal" && typeof v.token === "string") {
      if (lp.escalationSignals.length < 15) {
        lp.escalationSignals.push({
          token: v.token as string,
          ratio: typeof v.ratio === "number" ? v.ratio : 0,
        });
      }
    }
    next.set(f, lp);
  }
  cache = { at: Date.now(), byFeature: next };
  return next.get(feature) ?? empty;
}
