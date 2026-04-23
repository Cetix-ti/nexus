// ============================================================================
// Helpers année fiscale — dérive les dates start/end à partir du mois de
// début configuré sur OrgCapabilities.fiscalYearStartMonth (1-12, défaut 1).
//
// Convention : "fiscalYear = 2026" signifie l'année fiscale dont le mois
// de début (startMonth) tombe EN 2026. Ex : startMonth=4 et fy=2026
// → avril 2026 → mars 2027.
// ============================================================================

import prisma from "@/lib/prisma";

export interface FiscalYearRange {
  fiscalYear: number;
  startMonth: number;   // 1-12
  start: Date;          // début inclusif
  end: Date;            // fin exclusive (premier jour année fiscale suivante)
}

export async function getFiscalYearStartMonth(organizationId: string): Promise<number> {
  const caps = await prisma.orgCapabilities.findUnique({
    where: { organizationId },
    select: { fiscalYearStartMonth: true },
  });
  const v = caps?.fiscalYearStartMonth ?? 1;
  if (v < 1 || v > 12) return 1;
  return v;
}

export function buildFiscalYearRange(fiscalYear: number, startMonth: number): FiscalYearRange {
  const m = Math.min(12, Math.max(1, Math.floor(startMonth) || 1));
  const start = new Date(Date.UTC(fiscalYear, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(fiscalYear + 1, m - 1, 1, 0, 0, 0));
  return { fiscalYear, startMonth: m, start, end };
}

export async function getFiscalYearRange(
  organizationId: string,
  fiscalYear: number,
): Promise<FiscalYearRange> {
  const m = await getFiscalYearStartMonth(organizationId);
  return buildFiscalYearRange(fiscalYear, m);
}

/**
 * Pour une date donnée, retourne 1-12 = mois relatif dans l'année fiscale
 * (1 = premier mois FY, 12 = dernier). Si la date est hors range, retourne null.
 */
export function plannedMonthInFiscalYear(
  when: Date,
  range: FiscalYearRange,
): number | null {
  if (when < range.start || when >= range.end) return null;
  const deltaYears = when.getUTCFullYear() - range.start.getUTCFullYear();
  const deltaMonths = when.getUTCMonth() - range.start.getUTCMonth();
  const total = deltaYears * 12 + deltaMonths; // 0..11
  return total + 1;
}

/** Détermine l'année fiscale courante pour une org, à partir de today. */
export async function getCurrentFiscalYear(organizationId: string, now = new Date()): Promise<number> {
  const m = await getFiscalYearStartMonth(organizationId);
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  return month >= m ? year : year - 1;
}
