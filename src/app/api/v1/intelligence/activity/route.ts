// ============================================================================
// GET /api/v1/intelligence/activity
//
// Flux unifié des "actions" prises par le moteur d'auto-apprentissage sur
// les 14 derniers jours : nouveaux patterns appris, guidance prompt écrite,
// patterns neutralisés, throttles budget, KB drafts auto-créés, etc.
//
// Transparence pour l'admin : voir que la machine apprend bien, et ce
// qu'elle a changé au comportement du système sans intervention humaine.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

interface ActivityEvent {
  at: string;
  type:
    | "learned_pattern"
    | "prompt_guidance"
    | "pattern_neutralized"
    | "budget_throttle"
    | "playbook_mined"
    | "kb_draft_auto"
    | "audit_applied"
    | "similar_token_penalty";
  title: string;
  description: string;
  link?: string;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - 14 * 24 * 3600_000);
  const events: ActivityEvent[] = [];

  // 1. Patterns appris (scope="learned:<feature>")
  const learned = await prisma.aiPattern.findMany({
    where: {
      scope: { startsWith: "learned:" },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      scope: true,
      kind: true,
      key: true,
      value: true,
      createdAt: true,
      sampleCount: true,
    },
  });
  for (const p of learned) {
    const feature = p.scope.replace(/^learned:/, "");
    const v = p.value as { data?: unknown; metaStatus?: string } | null;
    const dataStr = typeof v?.data === "string" ? v.data : p.key;
    events.push({
      at: p.createdAt.toISOString(),
      type: "learned_pattern",
      title: `Pattern appris : ${labelKind(p.kind)}`,
      description: `${feature} — "${dataStr}" (×${p.sampleCount})`,
      link: `/intelligence/features/${feature}`,
    });
  }

  // 2. Patterns neutralisés (metaStatus=harmful). Dates = lastUpdatedAt.
  const neutralized = await prisma.aiPattern.findMany({
    where: {
      lastUpdatedAt: { gte: since },
      value: {
        path: ["metaStatus"],
        equals: "harmful",
      } as never,
    },
    orderBy: { lastUpdatedAt: "desc" },
    take: 20,
    select: {
      scope: true,
      kind: true,
      key: true,
      value: true,
      lastUpdatedAt: true,
    },
  });
  for (const p of neutralized) {
    const v = p.value as {
      data?: unknown;
      metaEvaluation?: {
        agreementBefore?: number;
        agreementAfter?: number;
        delta?: number;
      };
    } | null;
    const delta = v?.metaEvaluation?.delta ?? null;
    const featureMatch = p.scope.match(/^(?:learned|prompt):(.+)$/);
    const feature = featureMatch?.[1] ?? "unknown";
    const dataStr = typeof v?.data === "string" ? v.data : p.key;
    events.push({
      at: p.lastUpdatedAt.toISOString(),
      type: "pattern_neutralized",
      title: "Pattern neutralisé par meta-learning",
      description: `${feature} — "${dataStr}"${delta !== null ? ` (delta agreement ${Math.round(delta * 100)}pp)` : ""}`,
      link: feature !== "unknown" ? `/intelligence/features/${feature}` : undefined,
    });
  }

  // 3. Guidance prompt créée / mise à jour
  const guidances = await prisma.aiPattern.findMany({
    where: {
      scope: { startsWith: "prompt:" },
      kind: "guidance",
      lastUpdatedAt: { gte: since },
    },
    orderBy: { lastUpdatedAt: "desc" },
    take: 20,
    select: { scope: true, value: true, lastUpdatedAt: true },
  });
  for (const g of guidances) {
    const feature = g.scope.replace(/^prompt:/, "");
    const v = g.value as {
      additions?: string[];
      antiExamples?: string[];
      basedOnCases?: number;
    } | null;
    if (!v) continue;
    events.push({
      at: g.lastUpdatedAt.toISOString(),
      type: "prompt_guidance",
      title: `Guidance prompt écrite pour ${feature}`,
      description: `${v.additions?.length ?? 0} règle(s) ajoutée(s), ${v.antiExamples?.length ?? 0} anti-exemple(s) — basé sur ${v.basedOnCases ?? 0} cas d'échec`,
      link: `/intelligence/features/${feature}`,
    });
  }

  // 3b. Pénalités tokens apprises depuis les thumbs-down du widget similar
  const penalties = await prisma.aiPattern.findMany({
    where: {
      scope: "learned:similar",
      kind: "penalty_token",
      lastUpdatedAt: { gte: since },
    },
    orderBy: { lastUpdatedAt: "desc" },
    take: 15,
    select: { key: true, value: true, lastUpdatedAt: true },
  });
  for (const p of penalties) {
    const v = p.value as { badCount?: number; penaltyStrength?: number } | null;
    events.push({
      at: p.lastUpdatedAt.toISOString(),
      type: "similar_token_penalty",
      title: `Token pénalisé dans les tickets similaires : "${p.key}"`,
      description: `${v?.badCount ?? 0} thumbs-down du widget — malus ${Math.round((v?.penaltyStrength ?? 0) * 100)}% appliqué au scoring`,
    });
  }

  // 4. Throttles budget
  const throttles = await prisma.aiPattern.findMany({
    where: {
      scope: "budget:throttle",
      kind: "feature",
      lastUpdatedAt: { gte: since },
    },
    orderBy: { lastUpdatedAt: "desc" },
    take: 20,
    select: { key: true, value: true, lastUpdatedAt: true },
  });
  for (const t of throttles) {
    const v = t.value as { pctUsed?: number; usageCents?: number; budgetCents?: number } | null;
    events.push({
      at: t.lastUpdatedAt.toISOString(),
      type: "budget_throttle",
      title: `Feature ${t.key} throttlée (budget dépassé)`,
      description: `${v?.pctUsed ?? "?"}% utilisé (${(v?.usageCents ?? 0) / 100}$ / ${(v?.budgetCents ?? 0) / 100}$) — rabattue sur Ollama local`,
    });
  }

  // 5. Playbooks minés
  const playbooks = await prisma.aiPattern.findMany({
    where: {
      scope: { startsWith: "playbook:" },
      kind: "playbook",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { value: true, createdAt: true, sampleCount: true },
  });
  for (const p of playbooks) {
    const v = p.value as { title?: string } | null;
    events.push({
      at: p.createdAt.toISOString(),
      type: "playbook_mined",
      title: `Playbook extrait : ${v?.title ?? "(sans titre)"}`,
      description: `Depuis un cluster de ${p.sampleCount} tickets résolus`,
      link: "/intelligence/playbooks",
    });
  }

  // 6. Articles KB auto-créés
  const kbArticles = await prisma.article.findMany({
    where: {
      tags: { has: "auto-généré" },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, title: true, createdAt: true },
  });
  for (const a of kbArticles) {
    events.push({
      at: a.createdAt.toISOString(),
      type: "kb_draft_auto",
      title: `Article KB brouillon créé`,
      description: a.title,
      link: `/knowledge/${a.id}`,
    });
  }

  // 7. Audits récents (dernier batch) — résumé global
  const recentAudits = await prisma.aiAuditResult.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdAt: true },
  });
  if (recentAudits.length > 0) {
    const total = await prisma.aiAuditResult.count({
      where: { createdAt: { gte: since } },
    });
    const agreed = await prisma.aiAuditResult.count({
      where: { createdAt: { gte: since }, verdict: "agree" },
    });
    events.push({
      at: recentAudits[0].createdAt.toISOString(),
      type: "audit_applied",
      title: `${total} audits IA sur les 14 derniers jours`,
      description: `${agreed} accords (${total > 0 ? Math.round((agreed / total) * 100) : 0}%) — gpt-4o-mini juge gemma3`,
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ events: events.slice(0, 80) });
}

function labelKind(kind: string): string {
  switch (kind) {
    case "add_sanity_stop":
      return "mot générique exclu";
    case "category_mapping":
      return "mapping catégorie";
    case "confidence_penalty":
      return "pénalité confiance";
    default:
      return kind;
  }
}
