// ============================================================================
// NEXUS BILLING DOMAIN — Types
// PSA-grade time tracking & billing for MSP operations
// ============================================================================

// ----------------------------------------------------------------------------
// TIME ENTRIES
// ----------------------------------------------------------------------------

export type TimeType =
  | "remote_work"      // travail à distance
  | "onsite_work"      // travail sur site
  | "travel"           // déplacement
  | "preparation"     // préparation
  | "administration"  // administration
  | "waiting"         // attente
  | "follow_up"       // suivi
  | "internal"        // temps interne
  | "other";          // autre

export const TIME_TYPE_LABELS: Record<TimeType, string> = {
  remote_work: "Travail à distance",
  onsite_work: "Travail sur site",
  travel: "Déplacement",
  preparation: "Préparation",
  administration: "Administration",
  waiting: "Attente",
  follow_up: "Suivi",
  internal: "Temps interne",
  other: "Autre",
};

export const TIME_TYPE_ICONS: Record<TimeType, string> = {
  remote_work: "🖥️",
  onsite_work: "🏢",
  travel: "🚗",
  preparation: "📋",
  administration: "📊",
  waiting: "⏳",
  follow_up: "🔄",
  internal: "👥",
  other: "📌",
};

/**
 * Coverage status — déterminé par le moteur de règles
 * Explique pourquoi une entrée est facturable, incluse, exclue, etc.
 */
export type CoverageStatus =
  | "billable"                  // facturable au taux standard
  | "non_billable"              // non facturable (décision technicien/admin)
  | "included_in_contract"      // inclus au contrat (forfait MSP)
  | "deducted_from_hour_bank"   // déduit de la banque d'heures
  | "hour_bank_overage"         // dépassement de banque d'heures (facturable extra)
  | "excluded_from_billing"     // explicitement exclu (gratuité commerciale, etc.)
  | "internal_time"             // temps interne (jamais facturé)
  | "travel_billable"           // déplacement facturable
  | "travel_non_billable"       // déplacement non facturable
  | "msp_overage";              // dépassement du forfait MSP (facturable extra)

export const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  billable: "Facturable",
  non_billable: "Non facturable",
  included_in_contract: "Inclus au contrat",
  deducted_from_hour_bank: "Banque d'heures",
  hour_bank_overage: "Dépassement banque",
  excluded_from_billing: "Exclu de la facturation",
  internal_time: "Temps interne",
  travel_billable: "Déplacement facturable",
  travel_non_billable: "Déplacement non facturable",
  msp_overage: "Hors forfait MSP",
};

export const COVERAGE_VARIANTS: Record<CoverageStatus, "default" | "primary" | "success" | "warning" | "danger" | "outline"> = {
  billable: "primary",
  non_billable: "default",
  included_in_contract: "success",
  deducted_from_hour_bank: "success",
  hour_bank_overage: "warning",
  excluded_from_billing: "default",
  internal_time: "default",
  travel_billable: "primary",
  travel_non_billable: "default",
  msp_overage: "warning",
};

export interface TimeEntry {
  id: string;
  ticketId: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
  contractId?: string;
  agentId: string;
  agentName: string;
  timeType: TimeType;
  startedAt: string;          // ISO datetime
  endedAt?: string;           // ISO datetime (optional if duration is set manually)
  durationMinutes: number;    // computed or manual
  description: string;
  isAfterHours: boolean;
  isWeekend: boolean;
  isUrgent: boolean;
  isOnsite: boolean;          // true for onsite_work, false for remote
  /**
   * Flag "déplacement facturé" — indique qu'un déplacement séparé a été
   * créé pour cette saisie (évite de re-facturer le temps du trajet).
   * Ignoré par le moteur de billing mais préservé tel quel en base.
   */
  hasTravelBilled?: boolean;
  /**
   * Durée du trajet (aller-retour) en minutes quand hasTravelBilled=true.
   * Source de vérité unique pour le temps de trajet — l'onglet Déplacements
   * du ticket dérive ses entrées directement de ce champ.
   */
  travelDurationMinutes?: number | null;
  // Coverage decision (computed by billing engine)
  coverageStatus: CoverageStatus;
  coverageReason: string;     // human-readable explanation
  hourlyRate?: number;        // applicable rate if billable
  amount?: number;            // duration * rate
  approvalStatus: "draft" | "submitted" | "approved" | "rejected" | "invoiced";
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// TRAVEL
// ----------------------------------------------------------------------------

export interface TravelEntry {
  id: string;
  ticketId: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
  agentId: string;
  agentName: string;
  date: string;                // ISO date
  // Champs legacy — conservés pour rétro-compat des entrées existantes,
  // plus saisis dans l'UI. Le taux facturé est unique par client
  // (OrgMileageRate.kmRoundTrip × taux $/km global), indépendant du site.
  fromLocation?: string;
  toLocation?: string;
  distanceKm?: number;
  isRoundTrip?: boolean;
  // Durée = temps de trajet payé à l'agent (facultatif — selon contrat
  // agent). Récupérable dans les rapports même si non utilisé pour la
  // facturation client.
  durationMinutes?: number;
  // Calculated billing
  coverageStatus: CoverageStatus;
  coverageReason: string;
  ratePerKm?: number;
  flatFee?: number;
  amount?: number;
  notes?: string;
  approvalStatus: "draft" | "submitted" | "approved" | "rejected" | "invoiced";
  createdAt: string;
}

// ----------------------------------------------------------------------------
// EXPENSES
// ----------------------------------------------------------------------------

export type ExpenseType =
  | "meal"
  | "lodging"
  | "parking"
  | "tolls"
  | "supplies"
  | "software"
  | "hardware"
  | "subscription"
  | "other";

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  meal: "Repas",
  lodging: "Hébergement",
  parking: "Stationnement",
  tolls: "Péages",
  supplies: "Fournitures",
  software: "Logiciel",
  hardware: "Matériel",
  subscription: "Abonnement",
  other: "Autre",
};

export interface ExpenseEntry {
  id: string;
  ticketId: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
  agentId: string;
  agentName: string;
  date: string;
  expenseType: ExpenseType;
  description: string;
  amount: number;              // amount in CAD
  isReimbursable: boolean;     // tech is reimbursed
  isRebillable: boolean;       // billed back to client
  hasReceipt: boolean;
  receiptUrl?: string;
  coverageStatus: CoverageStatus;
  coverageReason: string;
  approvalStatus: "draft" | "submitted" | "approved" | "rejected" | "invoiced";
  notes?: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// BILLING PROFILE
// ----------------------------------------------------------------------------

export interface BillingProfile {
  id: string;
  name: string;
  description: string;
  // Hourly rates
  standardRate: number;          // taux horaire standard
  onsiteRate: number;            // taux sur site
  remoteRate: number;            // taux à distance
  urgentRate: number;            // taux urgence
  afterHoursRate: number;        // taux après-heures
  weekendRate: number;           // taux week-end
  // Travel
  travelRate: number;            // taux horaire de déplacement
  ratePerKm: number;             // taux au kilomètre
  travelFlatFee: number;         // frais fixes de déplacement
  // Hour bank overage
  hourBankOverageRate: number;   // taux pour dépassement banque
  // MSP excluded items rate
  mspExcludedRate: number;       // taux pour éléments hors forfait
  // Billing rules
  minimumBillableMinutes: number; // minimum facturable (ex: 15 min)
  roundingIncrementMinutes: number; // incrément d'arrondi (ex: 15 min)
  // Time type rules — which time types are billable by default
  billableTimeTypes: TimeType[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

/** Comment un mode de prestation est couvert (saisi côté client). */
export type BillingCoverageMode = "BILLABLE" | "FREE" | "INCLUDED";

/** Libellé personnalisable de type de travail pour un client donné.
 *  Le `hourlyRate` (s'il est défini) sert de base au moment de la saisie,
 *  les multiplicateurs soir/weekend du client s'appliquent par-dessus. */
export interface OrgWorkType {
  id: string;
  organizationId: string;
  label: string;
  timeType: TimeType;
  hourlyRate: number | null;
  isActive: boolean;
  sortOrder: number;
}

/**
 * Per-client overrides applied on top of a base BillingProfile.
 * Any field that's set will override the base profile's field.
 * Fields left undefined inherit from the base profile.
 */
export interface ClientBillingOverride {
  id: string;
  organizationId: string;
  organizationName: string;
  baseProfileId: string;       // The base BillingProfile this extends
  // --- Couverture par mode (par client) ---------------------------------
  remoteCoverage?: BillingCoverageMode; // default BILLABLE
  onsiteCoverage?: BillingCoverageMode; // default BILLABLE
  afterHoursMultiplier?: number; // default 1.5
  weekendMultiplier?: number;    // default 2.0
  // All numeric fields are optional — if undefined, use the base
  standardRate?: number;
  onsiteRate?: number;
  remoteRate?: number;
  urgentRate?: number;
  afterHoursRate?: number;
  weekendRate?: number;
  travelRate?: number;
  ratePerKm?: number;
  travelFlatFee?: number;
  hourBankOverageRate?: number;
  mspExcludedRate?: number;
  minimumBillableMinutes?: number;
  roundingIncrementMinutes?: number;
  notes?: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resolves the effective billing profile for a client by merging
 * the base profile with the client's override (if any).
 */
export interface ResolvedBillingProfile extends BillingProfile {
  baseProfileId: string;
  hasOverride: boolean;
  overriddenFields: string[];
}

// ----------------------------------------------------------------------------
// SUPPORT TIERS (per-client, "à la carte")
// ----------------------------------------------------------------------------

/**
 * A support tier defines a level of expertise (e.g. Niveau 1, Niveau 2,
 * Niveau 3, Senior, Architecte) with its own hourly rate. Tiers are
 * configured PER CLIENT and only apply when the client has at least one
 * "à la carte" billing component (T&M, hour bank, or hybrid plan).
 *
 * A client can have multiple billing modes simultaneously — for instance:
 * - À la carte + banque d'heures (the bank covers up to N hours, overage
 *   uses the support tier rate)
 * - À la carte + forfait MSP mensuel (the MSP plan covers managed services,
 *   anything excluded falls back to support tier rate)
 *
 * The tier of a ticket is set on the ticket itself and the engine resolves
 * the matching tier for the client to compute the rate.
 */
export interface SupportTier {
  id: string;
  organizationId: string;        // owner of the tier
  // Display
  name: string;                  // "Niveau 1", "Niveau 2", "Senior", etc.
  shortCode: string;             // "N1", "N2", "SR"
  description?: string;
  color: string;                 // hex
  order: number;                 // sort order
  // Pricing — applies when the time entry isn't covered by a bank/plan
  hourlyRate: number;            // standard hours
  afterHoursRate?: number;       // optional override for after-hours
  weekendRate?: number;          // optional override for weekends
  urgentRate?: number;           // optional override for urgent
  onsiteRate?: number;           // optional override for onsite
  travelRate?: number;           // optional travel rate per hour
  // Eligibility
  isActive: boolean;
  // Audit
  createdAt: string;
  updatedAt: string;
}

/**
 * Default tiers proposed when creating a new "à la carte" client.
 * The user can edit, remove, or add tiers afterwards.
 */
export const DEFAULT_SUPPORT_TIERS: Omit<
  SupportTier,
  "id" | "organizationId" | "createdAt" | "updatedAt"
>[] = [
  {
    name: "Niveau 1",
    shortCode: "N1",
    description: "Support de premier niveau (questions courantes, mots de passe, etc.)",
    color: "#10B981",
    order: 1,
    hourlyRate: 95,
    isActive: true,
  },
  {
    name: "Niveau 2",
    shortCode: "N2",
    description: "Support de second niveau (configuration, dépannage avancé)",
    color: "#3B82F6",
    order: 2,
    hourlyRate: 125,
    isActive: true,
  },
  {
    name: "Niveau 3",
    shortCode: "N3",
    description: "Support expert (réseau, infrastructure, architecture)",
    color: "#8B5CF6",
    order: 3,
    hourlyRate: 165,
    isActive: true,
  },
  {
    name: "Senior",
    shortCode: "SR",
    description: "Architecte / consultant senior",
    color: "#F59E0B",
    order: 4,
    hourlyRate: 195,
    isActive: true,
  },
];

// ----------------------------------------------------------------------------
// CONTRACTS
// ----------------------------------------------------------------------------

export type ContractType =
  | "time_and_materials"   // Temps et matériel
  | "msp_monthly"          // Forfait TI gérés mensuel
  | "hour_bank"            // Banque d'heures
  | "ftig"                 // Forfait Technicien IT Garanti
  | "prepaid_block"        // Bloc prépayé
  | "hybrid";              // Contrat hybride

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  time_and_materials: "Temps et matériel",
  msp_monthly: "Forfait TI gérés mensuel",
  hour_bank: "Banque d'heures",
  ftig: "Forfait Technicien IT Garanti",
  prepaid_block: "Bloc prépayé",
  hybrid: "Hybride",
};

export type ContractStatus = "draft" | "active" | "expiring_soon" | "expired" | "cancelled";

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Brouillon",
  active: "Actif",
  expiring_soon: "Expire bientôt",
  expired: "Expiré",
  cancelled: "Annulé",
};

/**
 * Hour bank settings for contracts of type "hour_bank"
 */
export interface HourBankSettings {
  totalHoursPurchased: number;    // heures achetées
  hoursConsumed: number;          // heures consommées
  // Time types deductible from the bank
  eligibleTimeTypes: TimeType[];
  // What happens at end of period
  carryOverHours: boolean;        // report des heures non utilisées
  // Overage behavior
  allowOverage: boolean;          // accepter le dépassement
  overageRate: number;            // taux pour les heures en dépassement (défaut)
  // Taux de dépassement contextuels — si défini (>0), supplante `overageRate`
  // pour le contexte correspondant. Permet d'avoir des tarifs distincts
  // hors banque pour un déplacement vs un onsite vs une intervention soir.
  extraTravelRate?: number;       // déplacement hors banque
  extraOnsiteRate?: number;       // sur place hors banque
  extraEveningRate?: number;      // soir/weekend hors banque
  // Travel inclusion
  includesTravel: boolean;
  includesOnsite: boolean;
  // Period
  validFrom: string;
  validTo: string;
}

/**
 * FTIG (Forfait Technicien IT Garanti) — abonnement mensuel à montant fixe
 * avec inclusions plafonnées par mois (heures sur place, heures de soir,
 * déplacements). Au-delà des plafonds, on bascule au taux `extraOnsiteRate`.
 *
 * Les compteurs `consumed*` sont calculés au moment de la décision en
 * sommant les TimeEntry du mois courant — ils ne sont pas persistés
 * (évite la dérive de compteurs cumulés vs réalité des saisies).
 */
export interface FtigSettings {
  monthlyAmount: number;          // montant mensuel facturé
  // Inclusions par mois — quotas orthogonaux/exclusifs :
  //   onsite : sur place + jour normal uniquement
  //   evening: à distance + soir uniquement
  //   weekend: weekend (peu importe sur place/à distance)
  //   travel : nombre de déplacements
  // Tout ce qui sort de ces quotas tombe en facturable au taux palier
  // × multiplicateur (1.0 jour, 1.5 soir, 2.0 weekend) via computeRate.
  includedOnsiteHours: number;
  includedEveningHours: number;
  includedWeekendHours: number;
  includedTravelCount: number;
  // Consommation observée du mois courant (calculée par server-decide,
  // depuis les TimeEntry — pas de compteurs persistés).
  consumedOnsiteHours: number;
  consumedEveningHours: number;
  consumedWeekendHours: number;
  consumedTravelCount: number;
  // Types de travail (OrgWorkType.id) qui bypassent intégralement le FTIG.
  // Toute saisie sur ces types tombe directement en T&M classique
  // (taux palier × multiplicateur). Cas typique : « Services professionnels »
  // pour les implantations/projets hors contrat de base.
  excludedWorkTypeIds: string[];
  // Tarif au-delà des plafonds (legacy : utilisé seulement si le palier de
  // l'agent n'est pas défini — sinon `computeRate` prime).
  extraOnsiteRate: number;
  // Période contractuelle (le forfait n'est actif que dans cette plage)
  validFrom: string;
  validTo: string;
}

/**
 * MSP Monthly plan settings for contracts of type "msp_monthly"
 */
export interface MSPPlanSettings {
  monthlyAmount: number;             // montant mensuel
  // Inclusions
  includedTimeTypes: TimeType[];
  includesRemoteSupport: boolean;
  includesOnsiteSupport: boolean;
  includesTravel: boolean;
  includesKilometers: boolean;
  includesUrgent: boolean;
  includesAfterHours: boolean;
  includesProjects: boolean;
  includesRecurringWork: boolean;
  // Cap
  hasMonthlyCap: boolean;
  monthlyCapHours?: number;
  // Excluded categories (ticket categories to exclude)
  excludedCategoryIds: string[];
  // Per-client exceptions
  customExceptions: string[];        // free text
}

export interface Contract {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  contractNumber: string;
  type: ContractType;
  status: ContractStatus;
  billingProfileId: string;
  startDate: string;
  endDate?: string;
  description: string;
  // Type-specific settings
  hourBank?: HourBankSettings;
  mspPlan?: MSPPlanSettings;
  ftig?: FtigSettings;
  // Auto-renewal
  autoRenew: boolean;
  // Notes
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// BILLING DECISION (output of rules engine)
// ----------------------------------------------------------------------------

export interface BillingDecision {
  status: CoverageStatus;
  reason: string;
  rate?: number;
  amount?: number;
  contractId?: string;
  appliedRule?: string;
  warnings?: string[];
}
