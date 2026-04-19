// ============================================================================
// MAINTENANCE SUGGESTER — propose des INTERVENTIONS PRÉVENTIVES à partir de :
//
//   1. Patterns RÉCURRENTS (job recurring-detector) : un pattern à ≥ 4
//      occurrences en < 90 jours chez un même client → indication qu'un fix
//      de surface est appliqué répétitivement sans traiter la racine.
//
//   2. Actifs en FIN DE VIE : warrantyExpiry dépassé ou purchaseDate > 5 ans.
//
//   3. Actifs avec tickets RÉCENTS sur-représentés (même asset mentionné
//      dans ≥ 3 tickets du mois courant).
//
// Pour chaque signal, on génère une suggestion structurée (via LLM gpt-4o-mini
// si préférence OpenAI, sinon gemma3 si dispo). La suggestion contient :
//   - title                  (ex: "Remplacer SRV-EX02 — 7 ans de service + pannes répétées")
//   - rationale              (pourquoi c'est proposé maintenant)
//   - estimatedEffort        ("S" | "M" | "L" | "XL")
//   - expectedBenefit        (1-3 phrases, client-facing)
//   - evidenceTicketIds      (liste de tickets qui fondent la suggestion)
//   - assetIds               (si concerné)
//   - clientImpact           ("low" | "medium" | "high")
//
// Stockage : AiPattern(scope="maintenance:suggestion", kind="item", key=<id>)
// Les admins voient la liste dans un dashboard "Opportunités de maintenance"
// et peuvent l'ACCEPTER → création d'un ticket SERVICE_REQUEST avec le
// contenu pré-rempli, ou REJETER (TTL 30 jours avant re-proposition).
//
// ⚠ Pas d'auto-création de ticket. Le MSP valide chaque proposition —
// cette IA n'initie PAS de vente sans approbation.
// ============================================================================

import prisma from "@/lib/prisma";
import { createHash } from "crypto";
import { runAiTask, tryParseJson } from "@/lib/ai/orchestrator";
import { POLICY_SALES_SUGGEST } from "@/lib/ai/orchestrator/policies";

const RECURRING_MIN_OCCURRENCES = 4;
const RECURRING_MIN_SPAN_DAYS = 10;
const ASSET_AGE_WARNING_YEARS = 5;
const TICKETS_PER_ASSET_MONTH = 3;
const MAX_SUGGESTIONS_PER_RUN = 12;
const REJECTION_COOLDOWN_DAYS = 30;

interface Suggestion {
  suggestionId: string;
  organizationId: string;
  basis: "recurring_pattern" | "aging_asset" | "asset_hotspot";
  title: string;
  rationale: string;
  estimatedEffort: "S" | "M" | "L" | "XL";
  expectedBenefit: string;
  evidenceTicketIds: string[];
  assetIds: string[];
  clientImpact: "low" | "medium" | "high";
  status: "open" | "accepted" | "rejected";
  confidence: number;
  detectedAt: string;
}

export async function runMaintenanceSuggester(): Promise<{
  signalsEvaluated: number;
  suggestionsWritten: number;
  skipped: number;
}> {
  const stats = {
    signalsEvaluated: 0,
    suggestionsWritten: 0,
    skipped: 0,
  };

  const now = Date.now();

  // 1. Signaux "recurring patterns" (scope="recurring:<orgId>").
  const recurring = await prisma.aiPattern.findMany({
    where: { scope: { startsWith: "recurring:" }, kind: "pattern" },
    select: { scope: true, value: true },
  });

  interface Signal {
    orgId: string;
    basis: Suggestion["basis"];
    title: string;
    context: string;
    ticketIds: string[];
    assetIds: string[];
    keyForId: string;
  }
  const signals: Signal[] = [];

  for (const r of recurring) {
    const orgId = r.scope.replace(/^recurring:/, "");
    // Format réel du job recurring-detector :
    // { clusterSize, firstSeen, lastSeen, spanDays, avgGapDays, ticketIds, exampleSubjects, medoid }
    const v = r.value as {
      ticketIds?: string[];
      clusterSize?: number;
      spanDays?: number;
      exampleSubjects?: string[];
    } | null;
    if (!v) continue;
    const occ = v.clusterSize ?? v.ticketIds?.length ?? 0;
    const span = v.spanDays ?? 0;
    if (occ < RECURRING_MIN_OCCURRENCES) continue;
    if (span < RECURRING_MIN_SPAN_DAYS) continue;

    const subjectSample = Array.isArray(v.exampleSubjects)
      ? v.exampleSubjects.slice(0, 3).join(" | ")
      : "";
    signals.push({
      orgId,
      basis: "recurring_pattern",
      title: `Pattern récurrent : ${subjectSample || "(sujets divers)"}`,
      context: `${occ} occurrences sur ${span} jours. Sujets : ${subjectSample}`,
      ticketIds: (v.ticketIds ?? []).slice(0, 10),
      assetIds: [],
      keyForId: `recurring|${orgId}|${createHash("sha256").update((v.ticketIds ?? []).sort().join("|")).digest("hex").slice(0, 12)}`,
    });
  }

  // 2. Signaux "actif vieillissant".
  const agingSince = new Date(
    now - ASSET_AGE_WARNING_YEARS * 365 * 24 * 3600_000,
  );
  const aging = await prisma.asset.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { purchaseDate: { lt: agingSince } },
        { warrantyExpiry: { lt: new Date(now) } },
      ],
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      type: true,
      manufacturer: true,
      model: true,
      purchaseDate: true,
      warrantyExpiry: true,
    },
    take: 100,
  });
  for (const a of aging) {
    const ageYears = a.purchaseDate
      ? Math.floor(
          (now - a.purchaseDate.getTime()) / (365 * 24 * 3600_000),
        )
      : null;
    const warrantyGone = a.warrantyExpiry
      ? a.warrantyExpiry.getTime() < now
      : false;
    const details: string[] = [];
    if (ageYears !== null) details.push(`${ageYears} ans d'âge`);
    if (warrantyGone) details.push("garantie expirée");
    if (a.manufacturer || a.model)
      details.push(`${a.manufacturer ?? ""} ${a.model ?? ""}`.trim());
    signals.push({
      orgId: a.organizationId,
      basis: "aging_asset",
      title: `Remplacement recommandé : ${a.name}`,
      context: details.join(" · "),
      ticketIds: [],
      assetIds: [a.id],
      keyForId: `aging|${a.id}`,
    });
  }

  // 3. Signaux "asset hotspot" : assets mentionnés ≥ N fois dans les
  //    derniers 30 jours de tickets.
  const since30d = new Date(now - 30 * 24 * 3600_000);
  const assets = await prisma.asset.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      organizationId: true,
      ipAddress: true,
    },
    take: 500,
  });
  const recentTickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: since30d } },
    select: {
      id: true,
      organizationId: true,
      subject: true,
      description: true,
    },
    take: 2000,
  });
  const byOrg = new Map<string, typeof recentTickets>();
  for (const t of recentTickets) {
    const list = byOrg.get(t.organizationId) ?? [];
    list.push(t);
    byOrg.set(t.organizationId, list);
  }
  for (const a of assets) {
    const pool = byOrg.get(a.organizationId) ?? [];
    if (pool.length === 0) continue;
    const assetName = a.name.toLowerCase();
    const matchingIds: string[] = [];
    for (const t of pool) {
      const hay = `${t.subject}\n${t.description ?? ""}`.toLowerCase();
      if (hay.includes(assetName) || (a.ipAddress && hay.includes(a.ipAddress))) {
        matchingIds.push(t.id);
      }
    }
    if (matchingIds.length >= TICKETS_PER_ASSET_MONTH) {
      signals.push({
        orgId: a.organizationId,
        basis: "asset_hotspot",
        title: `${a.name} — ${matchingIds.length} tickets en 30 jours`,
        context: `L'actif apparaît dans ${matchingIds.length} tickets récents — possible fin de vie ou config à revoir.`,
        ticketIds: matchingIds.slice(0, 10),
        assetIds: [a.id],
        keyForId: `hotspot|${a.id}|${since30d.toISOString().slice(0, 7)}`,
      });
    }
  }

  stats.signalsEvaluated = signals.length;
  if (signals.length === 0) return stats;

  // 4. Filtre les suggestions déjà rejetées récemment (cooldown).
  const cooldownSince = new Date(
    now - REJECTION_COOLDOWN_DAYS * 24 * 3600_000,
  );
  const existing = await prisma.aiPattern.findMany({
    where: { scope: "maintenance:suggestion", kind: "item" },
    select: { key: true, value: true, lastUpdatedAt: true },
  });
  const rejectedRecently = new Set<string>();
  const activeKeys = new Set<string>();
  for (const e of existing) {
    const v = e.value as Partial<Suggestion> | null;
    if (!v) continue;
    if (v.status === "rejected" && e.lastUpdatedAt > cooldownSince) {
      rejectedRecently.add(e.key);
    }
    if (v.status === "open" || v.status === "accepted") {
      activeKeys.add(e.key);
    }
  }

  // 5. Génère (ou refresh) les suggestions via LLM.
  const toGenerate = signals
    .filter((s) => !rejectedRecently.has(computeKey(s)))
    .slice(0, MAX_SUGGESTIONS_PER_RUN);

  for (const signal of toGenerate) {
    const key = computeKey(signal);
    if (activeKeys.has(key)) {
      // Suggestion déjà ouverte — on ne re-gen pas le contenu LLM pour
      // économiser les tokens. On rafraîchit juste lastUpdatedAt.
      try {
        await prisma.aiPattern.update({
          where: {
            scope_kind_key: {
              scope: "maintenance:suggestion",
              kind: "item",
              key,
            },
          },
          data: { value: undefined as never }, // no-op, touche updatedAt
        });
      } catch {
        /* ignore */
      }
      continue;
    }

    const generated = await generateSuggestion(signal);
    if (!generated) {
      stats.skipped++;
      continue;
    }

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "maintenance:suggestion",
            kind: "item",
            key,
          },
        },
        create: {
          scope: "maintenance:suggestion",
          kind: "item",
          key,
          value: generated as never,
          sampleCount: signal.ticketIds.length + signal.assetIds.length,
          confidence: generated.confidence,
        },
        update: {
          value: generated as never,
          confidence: generated.confidence,
        },
      });
      stats.suggestionsWritten++;
    } catch (err) {
      console.warn(`[maintenance] upsert failed for ${key}:`, err);
      stats.skipped++;
    }
  }

  return stats;
}

function computeKey(signal: {
  basis: string;
  keyForId: string;
}): string {
  return createHash("sha256").update(signal.keyForId).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// LLM : transforme un signal brut en suggestion structurée.
// ---------------------------------------------------------------------------

async function generateSuggestion(signal: {
  orgId: string;
  basis: "recurring_pattern" | "aging_asset" | "asset_hotspot";
  title: string;
  context: string;
  ticketIds: string[];
  assetIds: string[];
  keyForId: string;
}): Promise<Suggestion | null> {
  const system = `Tu es un consultant IT pour un MSP qui propose des INTERVENTIONS PRÉVENTIVES à ses clients.

À partir d'un signal (pattern récurrent, actif vieillissant, etc.), rédige une suggestion ACTIONNABLE. Ton professionnel, zéro baratin commercial agressif — le client doit voir un bénéfice concret.

Réponds en JSON strict :
{
  "refinedTitle": "titre court, max 80 chars",
  "rationale": "2-3 phrases expliquant le POURQUOI (données qui le motivent)",
  "expectedBenefit": "1-2 phrases — ce que le client gagne (fiabilité, coût, sécurité…)",
  "estimatedEffort": "S" | "M" | "L" | "XL",
  "clientImpact": "low" | "medium" | "high"
}

Guide effort :
- S  : intervention ≤ 2h (patch, config, documentation)
- M  : 2h–1j (upgrade logiciel, migration mineure)
- L  : 1–3j (remplacement matériel, migration modérée)
- XL : projet > 3j (refonte, migration majeure)

Guide impact :
- high   : problème bloquant, sécurité, fin de vie imminente
- medium : perte de productivité, risque modéré
- low    : confort, optimisation`;

  const user = `Signal type : ${signal.basis}
Contexte : ${signal.context}
Tickets associés : ${signal.ticketIds.length}
Actifs concernés : ${signal.assetIds.length}

Proposition initiale (brute) : ${signal.title}

Rédige la suggestion.`;

  const res = await runAiTask({
    policy: POLICY_SALES_SUGGEST,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: "generation",
  });
  if (!res.ok || !res.content) return null;
  const parsed = tryParseJson<{
    refinedTitle?: string;
    rationale?: string;
    expectedBenefit?: string;
    estimatedEffort?: string;
    clientImpact?: string;
  }>(res.content);
  if (!parsed) return null;

  const effort = ["S", "M", "L", "XL"].includes(parsed.estimatedEffort ?? "")
    ? (parsed.estimatedEffort as Suggestion["estimatedEffort"])
    : "M";
  const impact = ["low", "medium", "high"].includes(parsed.clientImpact ?? "")
    ? (parsed.clientImpact as Suggestion["clientImpact"])
    : "medium";

  return {
    suggestionId: computeKey(signal),
    organizationId: signal.orgId,
    basis: signal.basis,
    title: (parsed.refinedTitle ?? signal.title).slice(0, 120),
    rationale: (parsed.rationale ?? signal.context).slice(0, 500),
    expectedBenefit: (parsed.expectedBenefit ?? "").slice(0, 400),
    estimatedEffort: effort,
    clientImpact: impact,
    evidenceTicketIds: signal.ticketIds,
    assetIds: signal.assetIds,
    status: "open",
    confidence: 0.7,
    detectedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers publics — dashboard + API.
// ---------------------------------------------------------------------------

export async function getMaintenanceSuggestionsForOrg(
  organizationId: string,
  limit = 20,
): Promise<Suggestion[]> {
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "maintenance:suggestion", kind: "item" },
    select: { value: true },
  });
  const out: Suggestion[] = [];
  for (const r of rows) {
    const v = r.value as Partial<Suggestion> | null;
    if (!v || typeof v.suggestionId !== "string") continue;
    if (v.organizationId !== organizationId) continue;
    if (v.status !== "open") continue;
    out.push(v as Suggestion);
  }
  return out
    .sort((a, b) => {
      const rank: Record<Suggestion["clientImpact"], number> = {
        high: 2,
        medium: 1,
        low: 0,
      };
      return (
        rank[b.clientImpact] - rank[a.clientImpact] ||
        b.confidence - a.confidence
      );
    })
    .slice(0, limit);
}

export async function updateMaintenanceSuggestionStatus(
  suggestionId: string,
  status: "open" | "accepted" | "rejected",
): Promise<boolean> {
  const existing = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: "maintenance:suggestion",
        kind: "item",
        key: suggestionId,
      },
    },
    select: { value: true },
  });
  if (!existing) return false;
  const v = existing.value as Suggestion | null;
  if (!v) return false;
  const next = { ...v, status };
  await prisma.aiPattern.update({
    where: {
      scope_kind_key: {
        scope: "maintenance:suggestion",
        kind: "item",
        key: suggestionId,
      },
    },
    data: { value: next as never },
  });
  return true;
}
