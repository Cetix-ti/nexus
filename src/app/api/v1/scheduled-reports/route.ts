// ============================================================================
// /api/v1/scheduled-reports
//
// CRUD des planifications de rapports automatiques (Phase 4).
//
// GET  : liste — filtrée par scope si l'user est restreint à des orgs.
// POST : crée. SUPERVISOR+ avec accès à l'org.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { getAllowedOrgIds, userCanAccessOrg } from "@/lib/auth/org-scope";
import { computeNextRun, type Cadence } from "@/lib/scheduled-reports/cadence";

const CADENCES = ["monthly_first_day_8am", "weekly_monday_8am"] as const;
const VARIANTS = ["WITH_RATES", "HOURS_ONLY"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(200),
  organizationId: z.string().min(1),
  cadence: z.enum(CADENCES),
  variant: z.enum(VARIANTS).optional(),
  recipients: z.array(z.string().email()).min(1).max(50),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const orgId = req.nextUrl.searchParams.get("organizationId");
  const allowed = await getAllowedOrgIds(me.id, me.role);

  let where: Record<string, unknown> = {};
  if (orgId) {
    if (allowed !== "all" && !allowed.includes(orgId)) {
      return NextResponse.json({ data: [] });
    }
    where.organizationId = orgId;
  } else if (allowed !== "all") {
    where.organizationId = { in: allowed };
  }

  const rows = await prisma.scheduledReport.findMany({
    where,
    include: { organization: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }],
    take: 200,
  });

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      organizationId: r.organizationId,
      organizationName: r.organization.name,
      organizationSlug: r.organization.slug,
      cadence: r.cadence,
      variant: r.variant,
      recipients: r.recipients,
      isActive: r.isActive,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      nextRunAt: r.nextRunAt?.toISOString() ?? null,
      consecutiveFailures: r.consecutiveFailures,
      lastErrorMessage: r.lastErrorMessage,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const d = parsed.data;
  if (!(await userCanAccessOrg(me.id, me.role, d.organizationId))) {
    return NextResponse.json(
      { error: "Vous n'avez pas accès à cette organisation." },
      { status: 403 },
    );
  }

  const nextRunAt = computeNextRun(d.cadence as Cadence, new Date());

  const created = await prisma.scheduledReport.create({
    data: {
      name: d.name,
      organizationId: d.organizationId,
      cadence: d.cadence,
      variant: d.variant ?? "WITH_RATES",
      recipients: d.recipients,
      isActive: d.isActive ?? true,
      nextRunAt,
      createdById: me.id,
    },
  });
  return NextResponse.json({ id: created.id, nextRunAt: nextRunAt.toISOString() }, { status: 201 });
}
