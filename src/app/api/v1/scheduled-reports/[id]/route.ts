// ============================================================================
// /api/v1/scheduled-reports/[id]
//
// PATCH : modifie les champs (recipients, cadence, variant, isActive...).
// DELETE : supprime.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { userCanAccessOrg } from "@/lib/auth/org-scope";
import { computeNextRun, type Cadence } from "@/lib/scheduled-reports/cadence";

interface Ctx {
  params: Promise<{ id: string }>;
}

const CADENCES = ["monthly_first_day_8am", "weekly_monday_8am"] as const;
const VARIANTS = ["WITH_RATES", "HOURS_ONLY"] as const;

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cadence: z.enum(CADENCES).optional(),
  variant: z.enum(VARIANTS).optional(),
  recipients: z.array(z.string().email()).max(50).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const sched = await prisma.scheduledReport.findUnique({
    where: { id },
    select: { organizationId: true, cadence: true },
  });
  if (!sched) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userCanAccessOrg(me.id, me.role, sched.organizationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.variant !== undefined) data.variant = d.variant;
  if (d.recipients !== undefined) data.recipients = d.recipients;
  if (d.isActive !== undefined) data.isActive = d.isActive;
  if (d.cadence !== undefined && d.cadence !== sched.cadence) {
    data.cadence = d.cadence;
    data.nextRunAt = computeNextRun(d.cadence as Cadence, new Date());
  }
  await prisma.scheduledReport.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const sched = await prisma.scheduledReport.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!sched) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userCanAccessOrg(me.id, me.role, sched.organizationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.scheduledReport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
