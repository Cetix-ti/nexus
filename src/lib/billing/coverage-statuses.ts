// ============================================================================
// COVERAGE STATUSES — source unique de vérité pour la classification d'une
// TimeEntry en facturable / couverte / non facturable.
//
// Les valeurs concrètes sont assignées par `engine.ts` via resolveDecisionForEntry
// (8 valeurs au total — voir `KNOWN_COVERAGE_STATUSES`).
//
// Tous les consommateurs de TimeEntry (rapports, dashboards, widgets, finances,
// portail, my-space, supervision, monthly-reports) DOIVENT utiliser ces helpers
// au lieu de définir leurs propres listes de strings — sinon les KPIs divergent
// entre les vues et le PDF mensuel client ne matche plus le dashboard interne.
//
// Catégories métier :
//
//   - BILLABLE       : la saisie génère une facture au client (T&M direct, ou
//                      surcharge au-delà du forfait / banque d'heures).
//                      Inclut le déplacement facturable.
//
//   - COVERED        : la saisie est couverte par un contrat / banque, le
//                      client ne paie pas EN EXTRA cette ligne. Compte tout
//                      de même comme heures consommées.
//
//   - NON_BILLABLE   : aucune facturation au client (geste commercial,
//                      garantie, temps interne Cetix non imputé à un client).
// ============================================================================

export const BILLABLE_STATUSES = [
  "billable",
  "travel_billable",
  "hour_bank_overage",
  "msp_overage",
] as const;

export const COVERED_STATUSES = [
  "included_in_contract",
  "deducted_from_hour_bank",
] as const;

export const NON_BILLABLE_STATUSES = [
  "non_billable",
  "internal_time",
] as const;

/** Union de tous les statuts effectivement assignés par engine.ts. */
export const KNOWN_COVERAGE_STATUSES = [
  ...BILLABLE_STATUSES,
  ...COVERED_STATUSES,
  ...NON_BILLABLE_STATUSES,
] as const;

export type CoverageStatus = (typeof KNOWN_COVERAGE_STATUSES)[number];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const billableSet: ReadonlySet<string> = new Set(BILLABLE_STATUSES);
const coveredSet: ReadonlySet<string> = new Set(COVERED_STATUSES);
const nonBillableSet: ReadonlySet<string> = new Set(NON_BILLABLE_STATUSES);

/** True si la saisie génère une facture supplémentaire au client. */
export function isBillable(status: string | null | undefined): boolean {
  return status != null && billableSet.has(status);
}

/** True si la saisie est couverte par un contrat (sans extra à facturer). */
export function isCovered(status: string | null | undefined): boolean {
  return status != null && coveredSet.has(status);
}

/** True si la saisie n'est facturée à personne (geste, interne). */
export function isNonBillable(status: string | null | undefined): boolean {
  return status != null && nonBillableSet.has(status);
}

export type CoverageCategory = "billable" | "covered" | "non_billable" | "unknown";

/** Catégorise un coverageStatus pour fan-out dans les KPIs. */
export function getCoverageCategory(status: string | null | undefined): CoverageCategory {
  if (isBillable(status)) return "billable";
  if (isCovered(status)) return "covered";
  if (isNonBillable(status)) return "non_billable";
  return "unknown";
}

/** Pour les `where: { coverageStatus: { in: [...] } }` côté Prisma. */
export const BILLABLE_STATUSES_ARR: readonly string[] = BILLABLE_STATUSES;
export const COVERED_STATUSES_ARR: readonly string[] = COVERED_STATUSES;
export const NON_BILLABLE_STATUSES_ARR: readonly string[] = NON_BILLABLE_STATUSES;
