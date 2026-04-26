// ============================================================================
// Profils de facturation — accesseur DB (Phase 11B).
//
// Remplace l'usage direct de mockBillingProfiles dans server-decide.ts et
// la route /organizations/[id]/billing. La table billing_profiles est seedée
// avec les 3 profils historiques (bp_standard, bp_premium, bp_enterprise)
// au déploiement Phase 11B. Crud d'admin pour ajouter de nouveaux profils :
// /api/v1/billing/profiles (à venir, Phase 11B suite).
// ============================================================================

import prisma from "@/lib/prisma";
import type { BillingProfile } from "./types";

function rowToProfile(row: {
  slug: string;
  name: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  standardRate: number;
  onsiteRate: number;
  remoteRate: number;
  urgentRate: number;
  afterHoursRate: number;
  weekendRate: number;
  travelRate: number;
  ratePerKm: number;
  travelFlatFee: number;
  hourBankOverageRate: number;
  mspExcludedRate: number;
  minimumBillableMinutes: number;
  roundingIncrementMinutes: number;
  billableTimeTypes: string[];
  createdAt: Date;
}): BillingProfile {
  return {
    id: row.slug,
    name: row.name,
    description: row.description,
    standardRate: row.standardRate,
    onsiteRate: row.onsiteRate,
    remoteRate: row.remoteRate,
    urgentRate: row.urgentRate,
    afterHoursRate: row.afterHoursRate,
    weekendRate: row.weekendRate,
    travelRate: row.travelRate,
    ratePerKm: row.ratePerKm,
    travelFlatFee: row.travelFlatFee,
    hourBankOverageRate: row.hourBankOverageRate,
    mspExcludedRate: row.mspExcludedRate,
    minimumBillableMinutes: row.minimumBillableMinutes,
    roundingIncrementMinutes: row.roundingIncrementMinutes,
    billableTimeTypes: row.billableTimeTypes as BillingProfile["billableTimeTypes"],
    isDefault: row.isDefault,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listBillingProfiles(): Promise<BillingProfile[]> {
  const rows = await prisma.billingProfile.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(rowToProfile);
}

export async function getBillingProfileBySlug(
  slug: string,
): Promise<BillingProfile | null> {
  const row = await prisma.billingProfile.findUnique({ where: { slug } });
  return row ? rowToProfile(row) : null;
}

export async function getDefaultBillingProfile(): Promise<BillingProfile | null> {
  const row = await prisma.billingProfile.findFirst({
    where: { isActive: true, isDefault: true },
  });
  if (row) return rowToProfile(row);
  // Fallback : premier profil actif si aucun isDefault.
  const first = await prisma.billingProfile.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return first ? rowToProfile(first) : null;
}
