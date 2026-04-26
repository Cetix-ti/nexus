// ============================================================================
// /api/v1/billing/profiles
//
// Profils de facturation de base (Phase 11B).
//
// GET  : liste — staff seulement.
// POST : crée un profil. MSP_ADMIN+ requis.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { listBillingProfiles } from "@/lib/billing/profiles-db";

const createSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  standardRate: z.number().nonnegative(),
  onsiteRate: z.number().nonnegative(),
  remoteRate: z.number().nonnegative(),
  urgentRate: z.number().nonnegative().optional(),
  afterHoursRate: z.number().nonnegative().optional(),
  weekendRate: z.number().nonnegative().optional(),
  travelRate: z.number().nonnegative().optional(),
  ratePerKm: z.number().nonnegative().optional(),
  travelFlatFee: z.number().nonnegative().optional(),
  hourBankOverageRate: z.number().nonnegative().optional(),
  mspExcludedRate: z.number().nonnegative().optional(),
  minimumBillableMinutes: z.number().int().positive().optional(),
  roundingIncrementMinutes: z.number().int().positive().optional(),
  billableTimeTypes: z.array(z.string()).optional(),
});

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profiles = await listBillingProfiles();
  return NextResponse.json({ data: profiles });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
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
  // Si isDefault=true, retire le flag des autres profils.
  if (d.isDefault) {
    await prisma.billingProfile.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }
  const created = await prisma.billingProfile.create({
    data: {
      slug: d.slug,
      name: d.name,
      description: d.description ?? "",
      isDefault: d.isDefault ?? false,
      isActive: d.isActive ?? true,
      standardRate: d.standardRate,
      onsiteRate: d.onsiteRate,
      remoteRate: d.remoteRate,
      urgentRate: d.urgentRate ?? 0,
      afterHoursRate: d.afterHoursRate ?? 0,
      weekendRate: d.weekendRate ?? 0,
      travelRate: d.travelRate ?? 0,
      ratePerKm: d.ratePerKm ?? 0,
      travelFlatFee: d.travelFlatFee ?? 0,
      hourBankOverageRate: d.hourBankOverageRate ?? 0,
      mspExcludedRate: d.mspExcludedRate ?? 0,
      minimumBillableMinutes: d.minimumBillableMinutes ?? 15,
      roundingIncrementMinutes: d.roundingIncrementMinutes ?? 15,
      billableTimeTypes: d.billableTimeTypes ?? [],
    },
  });
  return NextResponse.json({ id: created.id, slug: created.slug }, { status: 201 });
}
