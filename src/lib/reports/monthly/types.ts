// ============================================================================
// Types du payload snapshot d'un rapport mensuel client.
//
// Ce payload est persisté tel quel dans MonthlyClientReport.payloadJson et
// constitue la source de vérité du rapport : le PDF est dérivé de lui. Si
// on change le template plus tard, on regénère le PDF à partir du payload
// sans retoucher la DB.
// ============================================================================

export interface MonthlyReportOrganization {
  id: string;
  name: string;
  slug: string;
  clientCode: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
}

export interface MonthlyReportAgent {
  id: string;
  fullName: string;
  email: string;
}

export interface MonthlyReportRequester {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
}

/**
 * Ligne de répartition des heures par agent.
 * - hours          : durée totale saisie (heures, décimal)
 * - billableHours  : portion facturable (hors inclus/forfait/non facturable)
 * - averageRate    : taux horaire moyen pondéré par minute sur les entries
 *                    facturables ; null si aucun entry facturable.
 * - billedAmount   : somme des amount des entries facturables ($).
 */
export interface MonthlyReportAgentBreakdown {
  agent: MonthlyReportAgent;
  hours: number;
  billableHours: number;
  averageRate: number | null;
  billedAmount: number;
  share: number; // 0-1, part du total mois
}

/** Une ligne pour la section "Tickets par demandeur". */
export interface MonthlyReportRequesterBreakdown {
  requester: MonthlyReportRequester;
  ticketsOpenedThisMonth: number; // tickets créés dans le mois
  ticketsResolvedThisMonth: number; // tickets resolvedAt dans le mois
  totalMinutes: number; // temps total saisi sur les tickets de ce demandeur (dans le mois)
}

/** Une entrée de temps telle qu'elle apparaît dans le rapport. */
export interface MonthlyReportTimeEntryLine {
  id: string;
  date: string; // ISO (yyyy-mm-dd)
  agentName: string;
  durationMinutes: number;
  description: string; // note saisie par l'agent
  coverageStatus: string; // "billable" | "non_billable" | "included_in_contract" | ...
  amount: number | null;
  /** Flags contextuels — utilisés par le document pour afficher des badges
   *  qui expliquent pourquoi le tarif horaire varie d'une entrée à l'autre
   *  (soir / weekend / urgent / sur place / déplacement facturé). */
  timeType?: string;
  isAfterHours?: boolean;
  isWeekend?: boolean;
  isUrgent?: boolean;
  isOnsite?: boolean;
  hasTravelBilled?: boolean;
  travelDurationMinutes?: number | null;
  hourlyRate?: number | null;
  /** Minutes effectivement facturées (≤ durationMinutes). Quand
   *  l'entrée est PARTIELLEMENT couverte par le forfait (ex: 0.75 h
   *  inclus + 0.25 h facturé), cette valeur permet au PDF de le rendre
   *  explicitement, sinon le client lit « 1 h × 75 $/h » et s'étonne
   *  que le montant soit 18.75 $ au lieu de 75 $. */
  billableMinutes?: number | null;
  /** Raison textuelle de la décision de couverture — affichée si
   *  l'entrée est facturable mais partiellement incluse. */
  coverageReason?: string;
}

/** Bloc détaillé d'un ticket dans le rapport. */
export interface MonthlyReportTicketBlock {
  displayId: string; // "TK-12967"
  ticketId: string;
  subject: string;
  status: string;
  createdAt: string | null; // ISO
  resolvedAt: string | null; // ISO, si résolu dans le mois
  closedAt: string | null;
  requesterName: string | null;
  /** Agents qui ont saisi du temps sur ce ticket dans le mois. */
  agents: { name: string; minutes: number }[];
  totalMinutes: number;
  billableMinutes: number;
  totalAmount: number;
  /** Note de résolution si disponible (dernier commentaire public) */
  resolutionNote: string | null;
  /** Notes des time entries du mois, triées par date. */
  timeEntries: MonthlyReportTimeEntryLine[];
  /** Résumé IA court (1-2 phrases) — affiché sous le sujet quand présent.
   *  null si l'IA n'a pas atteint le seuil de confiance requis. */
  aiSummary?: string | null;
}

/** Un déplacement dans la section "Déplacements". */
export interface MonthlyReportTripLine {
  date: string; // ISO (yyyy-mm-dd)
  agentName: string;
  /** ID affichable du ticket lié au déplacement (premier ticket visité ce jour). */
  ticketDisplayId: string | null;
  ticketSubject: string | null;
  /** Montant facturé au client pour ce déplacement ($), ou null si
   *  l'organisation n'est pas configurée pour facturation déplacement. */
  billedAmount: number | null;
  /** Statut FTIG du déplacement :
   *  - `included` : déplacement compté dans le quota FTIG inclus du mois
   *  - `billable` : au-delà du quota OU pas de quota FTIG configuré
   *  - `none`     : pas de FTIG actif sur l'org (mode déplacement standard) */
  ftigStatus?: "included" | "billable" | "none";
}

export interface MonthlyReportTripsSection {
  /** True si l'organisation a un OrgMileageRate avec billToClient=true.
   *  Dans ce cas les montants sont remplis, sinon tableau sans $. */
  billable: boolean;
  /** Raison de non-facturation lisible pour l'UI si billable=false. */
  nonBillableReason: string | null;
  count: number;
  lines: MonthlyReportTripLine[];
  totalAmount: number; // 0 si non facturable
}

export interface MonthlyReportTotals {
  /** Heures totales saisies (décimal). */
  totalHours: number;
  /** Heures facturables (hors inclus/non-facturable). */
  billableHours: number;
  /** Heures incluses au contrat / forfait. */
  coveredHours: number;
  /** Heures non-facturables (geste commercial, erreur, etc.). */
  nonBillableHours: number;

  /** Montant heures facturées ($). */
  hoursAmount: number;
  /** Montant déplacements facturés ($). */
  tripsAmount: number;
  /** Total général du mois ($). */
  totalAmount: number;

  /** Nombre de tickets distincts touchés dans le mois. */
  ticketsTouchedCount: number;
  /** Nombre de tickets créés dans le mois. */
  ticketsOpenedCount: number;
  /** Nombre de tickets résolus dans le mois (resolvedAt dans la période). */
  ticketsResolvedCount: number;
}

export interface MonthlyReportContractInfo {
  id: string;
  name: string;
  type: string;
  monthlyHours: number | null;
  hourlyRate: number | null;
}

/**
 * Page de récap (dernière page du PDF) — agrégats orientés HEURES, sans
 * mention de montants. Calculés en excluant le temps interne (jamais
 * pertinent côté client). Toutes les heures sont en décimal.
 */
export interface MonthlyReportRecap {
  /** Heures par couverture contrat. Les "covered" sont incluses au forfait
   *  (incl. banque d'heures) ; "billable" = au-delà du forfait ; "nonBillable"
   *  = geste commercial / exclu de la facturation. */
  byCoverage: {
    coveredHours: number;
    billableHours: number;
    nonBillableHours: number;
    coveredShare: number;
    billableShare: number;
    nonBillableShare: number;
  };

  /** Heures par plage horaire — mutuellement exclusives, priorité descendante
   *  Urgent > Weekend > Soir > Jour. Une heure urgente le samedi est
   *  comptabilisée dans `urgentHours` uniquement. */
  byTimeBucket: {
    dayHours: number;
    eveningHours: number;
    weekendHours: number;
    urgentHours: number;
    dayShare: number;
    eveningShare: number;
    weekendShare: number;
    urgentShare: number;
  };

  /** Heures par type d'activité (timeType). Trié par heures décroissantes.
   *  N'inclut pas "internal". */
  byActivity: Array<{
    timeType: string;
    hours: number;
    share: number;
  }>;

  /** Heures par catégorie de ticket. Tickets sans catégorie regroupés sous
   *  "Non classé" avec categoryId=null, toujours en dernière position. */
  byCategory: Array<{
    categoryId: string | null;
    name: string;
    hours: number;
    share: number;
  }>;

  /** Récap déplacements (effectifs, sans montants $). */
  trips: {
    total: number;
    includedFtig: number;
    billable: number;
    /** True si l'org a un quota FTIG actif sur la période. */
    ftigActive: boolean;
  };
}

/**
 * Suivi de banque d'heures — section dédiée du PDF affichée uniquement
 * quand l'org a une `orgBillingConfig.hourBank` configurée. Aide le client
 * à visualiser sa consommation cumulée vs son forfait, et à anticiper un
 * éventuel dépassement.
 *
 * Toutes les heures sont en décimal. Les seuils en pourcentage sont
 * calculés vs `totalHours` du forfait.
 */
export interface MonthlyReportHourBankTracking {
  /** Total d'heures du forfait (ex: 450 h annuelles). */
  totalHours: number;
  /** Heures consommées depuis le début de la période du forfait jusqu'à
   *  la fin du mois rapporté (inclus). */
  consumedHours: number;
  /** Heures restantes (= max(0, totalHours - consumedHours)). */
  remainingHours: number;
  /** Pourcentage consommé (0-1). */
  consumedShare: number;
  /** Période du forfait (typiquement année calendaire). */
  periodStart: string; // ISO yyyy-mm-dd
  periodEnd: string;   // ISO yyyy-mm-dd
  /** Histo mensuel : tous les mois de la période, du startDate au endDate
   *  inclus. Mois sans saisie = hours: 0. Triés chronologiquement. */
  monthlyHistory: Array<{
    /** "YYYY-MM" — clé du mois. */
    month: string;
    /** Libellé court FR ("avr.", "mai", "juin", …) pour l'axe X. */
    label: string;
    hours: number;
    /** True si c'est le mois rapporté (à mettre en valeur visuelle). */
    isCurrentReportMonth: boolean;
    /** True si le mois est dans le futur par rapport au mois rapporté
     *  (à griser / pointiller). */
    isFuture: boolean;
  }>;
  /** Rythme cible mensuel (= totalHours / nombre de mois du forfait).
   *  Affiché comme ligne horizontale de référence sur le graphique. */
  targetMonthlyHours: number;
  /** Moyenne réelle des mois écoulés (du startDate au mois rapporté). */
  averageMonthlyHours: number;
  /** Projection cumulée à la fin de la période, basée sur la moyenne
   *  des mois écoulés. */
  projectedTotalHours: number;
  /** Status calculé pour l'affichage du bandeau et la couleur :
   *   - "on_track"  : projection ≤ totalHours (vert)
   *   - "warning"   : projection > totalHours mais ≤ +10% (ambre)
   *   - "overage"   : déjà en dépassement OU projection > +10% (rouge)
   *   - "no_data"   : aucune heure consommée (état neutre, début de cycle). */
  status: "on_track" | "warning" | "overage" | "no_data";
}

export interface MonthlyReportPayload {
  /** Version du schéma payload. Incrémentée si breaking change de structure. */
  schemaVersion: 1;

  organization: MonthlyReportOrganization;
  /** Période couverte — premier et dernier jour (inclus). */
  period: {
    month: string; // "YYYY-MM"
    startDate: string; // ISO yyyy-mm-dd
    endDate: string; // ISO yyyy-mm-dd
    /** Libellé lisible FR ("avril 2026"). */
    label: string;
  };
  generatedAt: string; // ISO datetime
  generatedBy: { id: string; fullName: string } | null;

  activeContracts: MonthlyReportContractInfo[];
  totals: MonthlyReportTotals;

  byAgent: MonthlyReportAgentBreakdown[];
  byRequester: MonthlyReportRequesterBreakdown[];
  trips: MonthlyReportTripsSection;
  tickets: MonthlyReportTicketBlock[];

  /** Récap final (présent à partir du schemaVersion 1 enrichi). Les anciens
   *  payloads sans recap continuent d'être lus — le composant document gère
   *  l'absence. */
  recap?: MonthlyReportRecap;

  /** Suivi de banque d'heures — présent uniquement si l'org a une banque
   *  d'heures configurée (`orgBillingConfig.hourBank.rate > 0` et
   *  `total > 0`). Sinon `undefined` et la section n'est pas rendue. */
  hourBankTracking?: MonthlyReportHourBankTracking;
}
