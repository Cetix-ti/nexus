// ============================================================================
// SLA DRIFT PREDICTOR — prédit les tickets ouverts qui vont BREACHER leur SLA
// AVANT que ça arrive, pour que les techs puissent escalader ou prioriser.
//
// Signaux utilisés :
//   1. Âge courant du ticket vs dueAt.
//   2. Médiane de résolution des 50 tickets sémantiquement proches (embeddings).
//   3. Distribution des résolutions dans la catégorie (p75, p90).
//   4. Disponibilité courante de l'assigné (autres tickets ouverts).
//
// Output : un risk score 0-1 + raison humaine + ETA estimé.
//
// Tickets à risque ≥ 0.7 → écriture dans AiPattern(scope="sla:risk", kind="ticket")
// consommable par un widget "Tickets à risque SLA" dans le dashboard tech.
//
// Notification (optionnel) : si risk franchit 0.85 pour la première fois,
// crée une Notification pour l'assignee ("TK-XXX va breacher dans 2h").
//
// Pas de LLM — pur calcul statistique. Refresh toutes les 15 min pour
// capter les dérives rapidement.
// ============================================================================

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { cosineSim } from "@/lib/ai/embeddings";

const REFRESH_WINDOW_MIN_MS = 15 * 60_000;
const SIMILAR_TICKETS_SAMPLE = 50;
const RISK_ALERT_THRESHOLD = 0.85;

interface RiskAssessment {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  assigneeId: string | null;
  assigneeName: string | null;
  organizationId: string;
  priority: string;
  currentAgeMinutes: number;
  slaDeadlineMinutes: number | null;
  predictedResolutionMinutes: number | null;
  similarBasedP75: number | null;
  deadlineSource: "explicit" | "implicit";
  riskScore: number;
  reasons: string[];
  evaluatedAt: string;
}

export async function predictSlaRisks(): Promise<{
  ticketsScanned: number;
  atRisk: number;
  newAlerts: number;
}> {
  const stats = { ticketsScanned: 0, atRisk: 0, newAlerts: 0 };

  // 1. Tickets ouverts non résolus. On PRENDRA en compte :
  //    - ceux avec dueAt explicite (SLAPolicy rattachée)
  //    - ceux SANS dueAt — on leur affectera un deadline IMPLICITE depuis
  //      le SLA appris (job `implicit-sla`). Ça évite qu'un ticket sans
  //      politique formelle passe sous le radar.
  //    On ignore les monitoring/automation (SLA n'a pas de sens).
  const open = await prisma.ticket.findMany({
    where: {
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
      source: { notIn: ["MONITORING", "AUTOMATION"] },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      assigneeId: true,
      organizationId: true,
      categoryId: true,
      priority: true,
      createdAt: true,
      dueAt: true,
      slaBreached: true,
      embedding: true,
      assignee: { select: { firstName: true, lastName: true, email: true } },
    },
    take: 500,
  });
  stats.ticketsScanned = open.length;
  if (open.length === 0) return stats;

  // 2. Charge l'historique de résolution par catégorie (médiane + p75 + p90).
  const categoryIds = Array.from(
    new Set(open.map((t) => t.categoryId).filter((x): x is string => !!x)),
  );
  const since = new Date(Date.now() - 180 * 24 * 3600_000);
  const resolvedHist =
    categoryIds.length > 0
      ? await prisma.ticket.findMany({
          where: {
            categoryId: { in: categoryIds },
            status: { in: ["RESOLVED", "CLOSED"] },
            resolvedAt: { gte: since, not: null },
          },
          select: {
            categoryId: true,
            createdAt: true,
            resolvedAt: true,
            embedding: true,
          },
          take: 5000,
        })
      : [];

  const byCategoryStats = new Map<
    string,
    { p50: number; p75: number; p90: number; count: number }
  >();
  const byCategoryResolved = new Map<
    string,
    Array<{ vec: number[] | null; mins: number }>
  >();
  for (const r of resolvedHist) {
    if (!r.categoryId || !r.resolvedAt) continue;
    const mins = (r.resolvedAt.getTime() - r.createdAt.getTime()) / 60_000;
    const vec =
      Array.isArray(r.embedding) && r.embedding.length > 0
        ? (r.embedding as number[])
        : null;
    const arr = byCategoryResolved.get(r.categoryId) ?? [];
    arr.push({ vec, mins });
    byCategoryResolved.set(r.categoryId, arr);
  }
  for (const [catId, arr] of byCategoryResolved) {
    const sorted = [...arr].map((x) => x.mins).sort((a, b) => a - b);
    const p = (n: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * n))];
    byCategoryStats.set(catId, {
      p50: p(0.5),
      p75: p(0.75),
      p90: p(0.9),
      count: sorted.length,
    });
  }

  // 2b. Charge les SLA implicites par org (fallback pour deadline + predicted).
  //     Volume faible (quelques dizaines d'orgs max) → 1 seule query.
  const orgIds = Array.from(new Set(open.map((t) => t.organizationId)));
  const implicitSlaRows =
    orgIds.length > 0
      ? await prisma.aiPattern.findMany({
          where: {
            scope: "sla:implicit",
            kind: "org",
            key: { in: orgIds },
          },
          select: { key: true, value: true },
        })
      : [];
  interface ImplicitSlaStats {
    resolution: { p75: number; p90: number } | null;
    byPriority: Record<
      string,
      { resolution: { p75: number; p90: number } | null }
    >;
    sampleSize: number;
  }
  const implicitByOrg = new Map<string, ImplicitSlaStats>();
  for (const r of implicitSlaRows) {
    const v = r.value as {
      resolution?: { p75?: number; p90?: number } | null;
      byPriority?: Record<
        string,
        { resolution?: { p75?: number; p90?: number } | null }
      >;
      sampleSize?: number;
    } | null;
    if (!v) continue;
    const byPriority: ImplicitSlaStats["byPriority"] = {};
    for (const [prio, stats] of Object.entries(v.byPriority ?? {})) {
      byPriority[prio] = {
        resolution:
          stats?.resolution?.p75 && stats.resolution.p90
            ? { p75: stats.resolution.p75, p90: stats.resolution.p90 }
            : null,
      };
    }
    implicitByOrg.set(r.key, {
      resolution:
        v.resolution?.p75 && v.resolution?.p90
          ? { p75: v.resolution.p75, p90: v.resolution.p90 }
          : null,
      byPriority,
      sampleSize: v.sampleSize ?? 0,
    });
  }

  // 3. Charge les alertes SLA précédentes pour détecter les "nouvelles".
  const existingRisks = await prisma.aiPattern.findMany({
    where: { scope: "sla:risk", kind: "ticket" },
    select: { key: true, value: true },
  });
  const prevRiskScore = new Map<string, number>();
  for (const r of existingRisks) {
    const v = r.value as { riskScore?: number } | null;
    if (v && typeof v.riskScore === "number") {
      prevRiskScore.set(r.key, v.riskScore);
    }
  }

  // 4. Pour chaque ticket ouvert, calcule le score.
  const assessments: RiskAssessment[] = [];
  for (const t of open) {
    const now = Date.now();
    const age = (now - t.createdAt.getTime()) / 60_000;

    // Deadline : priorité à la valeur explicite, sinon calcul depuis le
    // SLA implicite appris pour cette org (p90 de résolution par priorité).
    // On ne génère un deadline implicite QUE si la confidence est bonne
    // (sampleSize ≥ 30). Sinon, sans base fiable, on skip ce ticket.
    const orgImplicit = implicitByOrg.get(t.organizationId);
    let slaDeadlineMin: number | null = null;
    let remaining: number | null = null;
    let deadlineSource: "explicit" | "implicit" = "explicit";
    if (t.dueAt) {
      slaDeadlineMin = Math.max(
        0,
        (t.dueAt.getTime() - t.createdAt.getTime()) / 60_000,
      );
      remaining = (t.dueAt.getTime() - now) / 60_000;
    } else if (orgImplicit && orgImplicit.sampleSize >= 30) {
      const prioStats = orgImplicit.byPriority[String(t.priority)]?.resolution;
      const fallbackStats = orgImplicit.resolution;
      const implicitResP90 = prioStats?.p90 ?? fallbackStats?.p90 ?? null;
      if (implicitResP90) {
        slaDeadlineMin = implicitResP90;
        remaining = implicitResP90 - age;
        deadlineSource = "implicit";
      }
    }
    if (slaDeadlineMin === null) continue; // sans base, on ne juge pas

    const catStats = t.categoryId ? byCategoryStats.get(t.categoryId) : null;

    // Prédiction "combien de temps ce ticket prendra" :
    // a) si embedding dispo, top-50 cosine dans la catégorie → p75 local
    // b) sinon fallback : p75 global de la catégorie
    let predicted: number | null = null;
    let similarBasedP75: number | null = null;
    const ticketVec =
      Array.isArray(t.embedding) && t.embedding.length > 0
        ? (t.embedding as number[])
        : null;
    if (ticketVec && t.categoryId) {
      const pool = byCategoryResolved.get(t.categoryId) ?? [];
      const scored = pool
        .filter((p) => p.vec)
        .map((p) => ({
          mins: p.mins,
          sim: cosineSim(ticketVec, p.vec!),
        }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, SIMILAR_TICKETS_SAMPLE);
      if (scored.length >= 5) {
        const sortedMins = scored.map((s) => s.mins).sort((a, b) => a - b);
        similarBasedP75 =
          sortedMins[Math.min(sortedMins.length - 1, Math.floor(sortedMins.length * 0.75))];
        predicted = similarBasedP75;
      }
    }
    if (predicted === null && catStats) {
      predicted = catStats.p75;
    }
    // Fallback final : SLA implicite appris pour cette org (priorité ciblée
    // si dispo, sinon moyenne de l'org).
    if (predicted === null && orgImplicit) {
      const prioP75 =
        orgImplicit.byPriority[String(t.priority)]?.resolution?.p75 ??
        orgImplicit.resolution?.p75 ??
        null;
      if (prioP75) predicted = prioP75;
    }

    // 5. Scoring.
    let risk = 0;
    const reasons: string[] = [];

    if (t.slaBreached) {
      risk = 1;
      reasons.push("SLA déjà breaché");
    } else if (remaining !== null) {
      if (remaining <= 0) {
        risk = 1;
        reasons.push(`deadline dépassée de ${Math.abs(Math.round(remaining))} min`);
      } else {
        // Ratio "temps restant" vs "prédiction réaliste".
        if (predicted !== null && predicted > 0) {
          const ratio = predicted / remaining;
          if (ratio >= 2) {
            risk = Math.min(0.95, 0.75 + (ratio - 2) * 0.05);
            reasons.push(
              `résolution médiane estimée ${Math.round(predicted)} min, reste ${Math.round(remaining)} min`,
            );
          } else if (ratio >= 1.2) {
            risk = 0.6;
            reasons.push(
              `estimation ${Math.round(predicted)} min proche du délai restant ${Math.round(remaining)} min`,
            );
          } else if (ratio >= 0.8) {
            risk = 0.35;
            reasons.push(`deadline serrée (${Math.round(remaining)} min)`);
          }
        } else if (remaining < 60) {
          risk = 0.5;
          reasons.push(`moins d'1h avant deadline`);
        }
      }
    }

    // Bonus de risque : pas encore assigné.
    if (!t.assigneeId && risk > 0.1) {
      risk = Math.min(1, risk + 0.1);
      reasons.push("aucun assignataire");
    }

    // Bonus de risque : assigné surchargé (>10 tickets ouverts). Calculé
    // uniquement si le risque est déjà non-négligeable pour éviter un count
    // inutile en DB sur 500 tickets.
    if (t.assigneeId && risk > 0.4) {
      const load = await prisma.ticket.count({
        where: {
          assigneeId: t.assigneeId,
          status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
        },
      });
      if (load >= 10) {
        risk = Math.min(1, risk + 0.1);
        reasons.push(`assigné surchargé (${load} tickets ouverts)`);
      }
    }

    if (risk < 0.3) continue; // filtre les faibles risques

    stats.atRisk++;
    const assigneeName = t.assignee
      ? `${t.assignee.firstName ?? ""} ${t.assignee.lastName ?? ""}`.trim() ||
        t.assignee.email
      : null;

    if (deadlineSource === "implicit") {
      reasons.push("deadline inférée du SLA historique client (pas de SLAPolicy)");
    }

    assessments.push({
      ticketId: t.id,
      ticketNumber: t.number,
      subject: t.subject,
      assigneeId: t.assigneeId,
      assigneeName,
      organizationId: t.organizationId,
      priority: String(t.priority),
      currentAgeMinutes: Math.round(age),
      slaDeadlineMinutes: slaDeadlineMin ? Math.round(slaDeadlineMin) : null,
      predictedResolutionMinutes:
        predicted !== null ? Math.round(predicted) : null,
      similarBasedP75:
        similarBasedP75 !== null ? Math.round(similarBasedP75) : null,
      deadlineSource,
      riskScore: Math.round(risk * 1000) / 1000,
      reasons,
      evaluatedAt: new Date().toISOString(),
    });
  }

  // 6. Persist + détection des nouvelles alertes.
  const activeIds = new Set(assessments.map((a) => a.ticketId));
  // Supprime les patterns qui ne sont plus à risque.
  const staleIds = Array.from(prevRiskScore.keys()).filter(
    (id) => !activeIds.has(id),
  );
  if (staleIds.length > 0) {
    await prisma.aiPattern.deleteMany({
      where: {
        scope: "sla:risk",
        kind: "ticket",
        key: { in: staleIds },
      },
    });
  }

  for (const a of assessments) {
    const prev = prevRiskScore.get(a.ticketId) ?? 0;
    const isNewAlert =
      a.riskScore >= RISK_ALERT_THRESHOLD && prev < RISK_ALERT_THRESHOLD;

    try {
      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: "sla:risk",
            kind: "ticket",
            key: a.ticketId,
          },
        },
        create: {
          scope: "sla:risk",
          kind: "ticket",
          key: a.ticketId,
          value: a as never,
          sampleCount: 1,
          confidence: a.riskScore,
        },
        update: {
          value: a as never,
          confidence: a.riskScore,
        },
      });
      if (isNewAlert && a.assigneeId) {
        await maybeNotifyAssignee(a);
        stats.newAlerts++;
      }
    } catch (err) {
      console.warn(`[sla-drift] upsert failed for ${a.ticketId}:`, err);
    }
  }

  return stats;
}

async function maybeNotifyAssignee(a: RiskAssessment): Promise<void> {
  try {
    // Dédup : pas de notification si une identique a déjà été créée dans
    // les 6 dernières heures pour ce ticket.
    const recent = await prisma.notification.findFirst({
      where: {
        userId: a.assigneeId!,
        type: "sla_risk",
        metadata: {
          path: ["ticketId"],
          equals: a.ticketId,
        } as unknown as Prisma.JsonFilter,
        createdAt: { gte: new Date(Date.now() - 6 * 3600_000) },
      },
      select: { id: true },
    });
    if (recent) return;

    const title = `Risque SLA élevé — TK-${a.ticketNumber}`;
    const body = a.reasons.length
      ? a.reasons[0]
      : "Ticket à risque de breach imminent.";
    await prisma.notification.create({
      data: {
        userId: a.assigneeId!,
        type: "sla_risk",
        title,
        body,
        link: `/tickets/${a.ticketId}`,
        metadata: {
          ticketId: a.ticketId,
          ticketNumber: a.ticketNumber,
          riskScore: a.riskScore,
          reasons: a.reasons,
        } as never,
      },
    });
  } catch (err) {
    console.warn("[sla-drift] notify failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Helper public — tickets à risque pour un user ou une org donnée.
// ---------------------------------------------------------------------------

export async function getSlaRisksForUser(
  userId: string,
): Promise<RiskAssessment[]> {
  const rows = await prisma.aiPattern.findMany({
    where: { scope: "sla:risk", kind: "ticket" },
    select: { value: true },
  });
  const out: RiskAssessment[] = [];
  for (const r of rows) {
    const v = r.value as Partial<RiskAssessment> | null;
    if (!v || typeof v.riskScore !== "number") continue;
    if (v.assigneeId !== userId) continue;
    out.push(v as RiskAssessment);
  }
  return out.sort((a, b) => b.riskScore - a.riskScore);
}
