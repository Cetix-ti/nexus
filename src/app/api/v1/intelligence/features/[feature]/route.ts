// ============================================================================
// GET /api/v1/intelligence/features/[feature]
//
// Vue détaillée d'une feature IA : qualité historique, patterns appris,
// guidance prompt en vigueur, cas récents de désaccord.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

const AUDITED_FEATURES = ["triage", "category_suggest", "priority_suggest"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ feature: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { feature } = await params;
  if (!AUDITED_FEATURES.includes(feature)) {
    return NextResponse.json({ error: "Unknown feature" }, { status: 400 });
  }

  const since = new Date(Date.now() - 60 * 24 * 3600_000);
  const [audits, healthRow, learnedPatterns, guidanceRow] = await Promise.all([
    prisma.aiAuditResult.findMany({
      where: { feature, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        invocationId: true,
        verdict: true,
        judgeConfidence: true,
        reasoning: true,
        suggestion: true,
        createdAt: true,
      },
    }),
    prisma.aiPattern.findUnique({
      where: {
        scope_kind_key: {
          scope: "meta:feature_health",
          kind: "score",
          key: feature,
        },
      },
      select: { value: true, lastUpdatedAt: true },
    }),
    prisma.aiPattern.findMany({
      where: { scope: `learned:${feature}` },
      orderBy: { lastUpdatedAt: "desc" },
      take: 100,
      select: {
        kind: true,
        key: true,
        value: true,
        sampleCount: true,
        confidence: true,
        lastUpdatedAt: true,
      },
    }),
    prisma.aiPattern.findUnique({
      where: {
        scope_kind_key: {
          scope: `prompt:${feature}`,
          kind: "guidance",
          key: "current",
        },
      },
      select: { value: true, lastUpdatedAt: true },
    }),
  ]);

  // Trend daily agreement rate (last 30 days buckets).
  const dailyBuckets = new Map<
    string,
    { total: number; agreed: number }
  >();
  for (const a of audits) {
    const day = a.createdAt.toISOString().slice(0, 10);
    const row = dailyBuckets.get(day) ?? { total: 0, agreed: 0 };
    row.total++;
    if (a.verdict === "agree") row.agreed++;
    dailyBuckets.set(day, row);
  }
  const dailyTrend = Array.from(dailyBuckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-30)
    .map(([day, v]) => ({
      day,
      agreementRate: v.total > 0 ? Math.round((v.agreed / v.total) * 1000) / 1000 : 0,
      total: v.total,
    }));

  // Enrichit les cas de désaccord récents avec les tickets.
  const recentDisagreements = audits.filter(
    (a) => a.verdict === "disagree" || a.verdict === "partial",
  );
  const invocationIds = recentDisagreements.map((a) => a.invocationId);
  const invocations =
    invocationIds.length > 0
      ? await prisma.aiInvocation.findMany({
          where: { id: { in: invocationIds } },
          select: { id: true, ticketId: true, response: true },
        })
      : [];
  const invById = new Map(invocations.map((i) => [i.id, i]));
  const ticketIds = invocations
    .map((i) => i.ticketId)
    .filter((x): x is string => !!x);
  const tickets =
    ticketIds.length > 0
      ? await prisma.ticket.findMany({
          where: { id: { in: ticketIds } },
          select: {
            id: true,
            number: true,
            subject: true,
            category: { select: { name: true } },
          },
        })
      : [];
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  const casesOut = recentDisagreements.slice(0, 25).map((a) => {
    const inv = invById.get(a.invocationId);
    const tck = inv?.ticketId ? ticketById.get(inv.ticketId) : null;
    return {
      auditId: a.id,
      verdict: a.verdict,
      judgeConfidence: a.judgeConfidence,
      reasoning: a.reasoning.slice(0, 500),
      suggestion: a.suggestion ? a.suggestion.slice(0, 300) : null,
      createdAt: a.createdAt.toISOString(),
      ticketId: tck?.id ?? null,
      ticketNumber: tck?.number ?? null,
      ticketSubject: tck?.subject ?? null,
      currentCategoryName: tck?.category?.name ?? null,
      modelResponsePreview: inv?.response
        ? inv.response.slice(0, 400)
        : null,
    };
  });

  // Aggregate des patterns par kind.
  const patternsByKind: Record<
    string,
    Array<{
      key: string;
      data: string;
      sampleCount: number;
      confidence: number;
      metaStatus: string | null;
      updatedAt: string;
    }>
  > = {};
  for (const p of learnedPatterns) {
    const v = p.value as {
      data?: unknown;
      metaStatus?: string;
    } | null;
    const row = {
      key: p.key,
      data:
        typeof v?.data === "string"
          ? v.data
          : p.key.split(":").slice(1).join(":"),
      sampleCount: p.sampleCount,
      confidence: p.confidence,
      metaStatus: typeof v?.metaStatus === "string" ? v.metaStatus : null,
      updatedAt: p.lastUpdatedAt.toISOString(),
    };
    (patternsByKind[p.kind] ??= []).push(row);
  }

  // Counts globaux.
  const total = audits.length;
  const agreed = audits.filter((a) => a.verdict === "agree").length;
  const disagreed = audits.filter((a) => a.verdict === "disagree").length;
  const partial = audits.filter((a) => a.verdict === "partial").length;

  return NextResponse.json({
    feature,
    health: {
      summary: healthRow?.value ?? null,
      updatedAt: healthRow?.lastUpdatedAt ?? null,
    },
    stats: {
      totalAudits: total,
      agreed,
      disagreed,
      partial,
      agreementRate: total > 0 ? Math.round((agreed / total) * 1000) / 1000 : 0,
    },
    dailyTrend,
    learnedPatterns: patternsByKind,
    guidance: {
      value: guidanceRow?.value ?? null,
      updatedAt: guidanceRow?.lastUpdatedAt ?? null,
    },
    disagreementCases: casesOut,
  });
}
