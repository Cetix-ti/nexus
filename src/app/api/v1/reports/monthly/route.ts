// ============================================================================
// GET  /api/v1/reports/monthly?organizationId=X      (agent) : liste
// POST /api/v1/reports/monthly                        (agent) : génère
//
// Accès : tout staff MSP (non-CLIENT_*). Les clients utilisent /portal/.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getAllowedOrgIds, userCanAccessOrg } from "@/lib/auth/org-scope";
import { generateMonthlyReport } from "@/lib/reports/monthly/service";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = req.nextUrl.searchParams.get("organizationId");
  const allowedOrgIds = await getAllowedOrgIds(me.id, me.role);

  // Compose le filtre Phase 9 : si l'user est limité, on intersecte avec
  // l'org demandée (s'il y en a une), sinon on liste les orgs autorisées.
  let whereOrgFilter: { organizationId?: string | { in: string[] } } = {};
  if (allowedOrgIds === "all") {
    if (orgId) whereOrgFilter = { organizationId: orgId };
  } else if (orgId && !allowedOrgIds.includes(orgId)) {
    whereOrgFilter = { organizationId: { in: [] } };
  } else if (orgId) {
    whereOrgFilter = { organizationId: orgId };
  } else {
    whereOrgFilter = { organizationId: { in: allowedOrgIds } };
  }

  const rows = await prisma.monthlyClientReport.findMany({
    where: whereOrgFilter,
    orderBy: [{ organizationId: "asc" }, { period: "desc" }],
    select: {
      id: true,
      organizationId: true,
      organization: { select: { id: true, name: true, slug: true } },
      period: true,
      generatedAt: true,
      generatedByUser: {
        select: { id: true, firstName: true, lastName: true },
      },
      fileSizeBytes: true,
      filePath: true,
      publishedToPortal: true,
      publishedAt: true,
    },
    take: 500,
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organization.name,
      organizationSlug: r.organization.slug,
      period: r.period.toISOString().slice(0, 7),
      generatedAt: r.generatedAt.toISOString(),
      generatedByName: r.generatedByUser
        ? `${r.generatedByUser.firstName} ${r.generatedByUser.lastName}`.trim()
        : null,
      fileSizeBytes: r.fileSizeBytes,
      hasPdf: !!r.filePath,
      publishedToPortal: r.publishedToPortal,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    })),
  });
}

const generateSchema = z.object({
  organizationId: z.string().min(1),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM"),
  overwrite: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Scoping Phase 9 : pas de génération sur une org hors du périmètre.
  if (!(await userCanAccessOrg(me.id, me.role, parsed.data.organizationId))) {
    return NextResponse.json(
      { error: "Vous n'avez pas accès à cette organisation." },
      { status: 403 },
    );
  }

  try {
    const result = await generateMonthlyReport({
      organizationId: parsed.data.organizationId,
      period: parsed.data.period,
      overwrite: parsed.data.overwrite ?? true,
      generatedBy: {
        id: me.id,
        fullName: `${me.firstName} ${me.lastName}`.trim() || me.email,
      },
    });
    return NextResponse.json({ id: result.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
