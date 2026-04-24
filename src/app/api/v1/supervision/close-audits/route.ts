// ============================================================================
// GET /api/v1/supervision/close-audits
//
// Agrège les audits IA "close_audit" dont le verdict n'est PAS "ready" —
// c.à.d. les tickets qui ont été fermés / résolus avec une documentation
// jugée insuffisante ou à améliorer par l'IA. Vue superviseur : liste les
// occurrences par agent (assigné au moment de l'audit) sur une plage.
//
// Paramètres :
//   - from, to : ISO strings (défaut : 30 derniers jours)
//   - agentId  : filtre facultatif sur un agent précis
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface AuditResult {
  readinessScore?: number;
  verdict?: "ready" | "needs_improvement" | "blocked";
  warnings?: string[];
  missingFields?: string[];
}

function parseResponse(s: string | null | undefined): AuditResult | null {
  if (!s) return null;
  try {
    // La réponse peut être encadrée de ```json ... ```, on enlève les fences
    // au besoin. auditTicketForClose stocke déjà du JSON propre mais on reste
    // tolérant.
    const trimmed = s.trim();
    const body = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "")
      : trimmed;
    return JSON.parse(body) as AuditResult;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    me.role !== "SUPER_ADMIN" &&
    me.role !== "MSP_ADMIN" &&
    me.role !== "SUPERVISOR"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const agentId = url.searchParams.get("agentId") ?? undefined;

  const from = fromParam
    ? new Date(fromParam)
    : new Date(Date.now() - 30 * 24 * 3600_000);
  const to = toParam ? new Date(toParam) : new Date();

  // On prend les 300 dernières invocations close_audit sur la plage.
  // Si le même ticket a été audité plusieurs fois, on garde la plus récente.
  const invocations = await prisma.aiInvocation.findMany({
    where: {
      feature: "close_audit",
      status: "ok",
      createdAt: { gte: from, lte: to },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      ticketId: true,
      response: true,
      createdAt: true,
    },
  });

  // Dedup par ticket (dernier audit en tête puisque déjà trié desc).
  const latestByTicket = new Map<string, (typeof invocations)[number]>();
  for (const inv of invocations) {
    if (!inv.ticketId) continue;
    if (!latestByTicket.has(inv.ticketId)) latestByTicket.set(inv.ticketId, inv);
  }

  const ticketIds = Array.from(latestByTicket.keys());
  if (ticketIds.length === 0) {
    return NextResponse.json({ agents: [], total: 0 });
  }

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      closedAt: true,
      resolvedAt: true,
      assigneeId: true,
      assignee: {
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      },
      organization: { select: { id: true, name: true } },
    },
  });
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  // On ne garde que les verdicts "needs_improvement" ou "blocked".
  interface Row {
    invocationId: string;
    ticketId: string;
    ticketNumber: number;
    ticketSubject: string;
    orgName: string;
    closedAt: string | null;
    verdict: "needs_improvement" | "blocked";
    readinessScore: number;
    warnings: string[];
    missingFields: string[];
    agent: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      avatar: string | null;
    } | null;
  }

  const rows: Row[] = [];
  for (const inv of latestByTicket.values()) {
    const t = ticketById.get(inv.ticketId!);
    if (!t) continue;
    if (agentId && t.assigneeId !== agentId) continue;
    const parsed = parseResponse(inv.response);
    if (!parsed?.verdict || parsed.verdict === "ready") continue;
    rows.push({
      invocationId: inv.id,
      ticketId: t.id,
      ticketNumber: t.number,
      ticketSubject: t.subject,
      orgName: t.organization?.name ?? "",
      closedAt: (t.closedAt ?? t.resolvedAt)?.toISOString() ?? null,
      verdict: parsed.verdict,
      readinessScore: parsed.readinessScore ?? 0,
      warnings: parsed.warnings ?? [],
      missingFields: parsed.missingFields ?? [],
      agent: t.assignee
        ? {
            id: t.assignee.id,
            firstName: t.assignee.firstName,
            lastName: t.assignee.lastName,
            email: t.assignee.email,
            avatar: t.assignee.avatar,
          }
        : null,
    });
  }

  // Regroupe par agent.
  interface AgentBucket {
    agent: Row["agent"];
    needsImprovement: number;
    blocked: number;
    items: Row[];
  }
  const buckets = new Map<string, AgentBucket>();
  for (const r of rows) {
    const key = r.agent?.id ?? "__unassigned__";
    if (!buckets.has(key)) {
      buckets.set(key, {
        agent: r.agent,
        needsImprovement: 0,
        blocked: 0,
        items: [],
      });
    }
    const b = buckets.get(key)!;
    if (r.verdict === "blocked") b.blocked++;
    else b.needsImprovement++;
    b.items.push(r);
  }

  const agents = Array.from(buckets.values()).sort(
    (a, b) => b.blocked + b.needsImprovement - (a.blocked + a.needsImprovement),
  );

  return NextResponse.json({
    agents,
    total: rows.length,
    range: { from: from.toISOString(), to: to.toISOString() },
  });
}
