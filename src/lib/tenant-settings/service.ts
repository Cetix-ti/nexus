import prisma from "@/lib/prisma";

export interface PortalBranding {
  logo: string | null;
  primaryColor: string;
  companyName: string;
}

export interface RegionalSettings {
  timezone: string;
  language: string;
  dateFormat: string;
}

export interface TicketSettings {
  numberingPrefix: string;
  defaultPriority: string;
  defaultQueue: string;
  autoCloseDays: number;
}

/**
 * Config du Kanban des sauvegardes (page /backups → onglet "Suivi").
 *
 * - titlePattern : gabarit du titre quand on génère un template depuis les
 *   alertes Veeam. Placeholders disponibles :
 *     {clientName}    → nom de l'organisation
 *     {clientCode}    → code client (vide si absent)
 *     {failedCount}   → nombre de jobs en échec
 *     {date}          → YYYY-MM-DD de la dernière alerte FAILED incluse
 *
 * - categoryId / subcategoryId : catégorie (et sous-cat) dans laquelle le
 *   ticket créé au moment du drop en colonne 2 sera classé. null = aucune
 *   catégorie (fallback ticket non classé).
 *
 * - priority : priorité par défaut sur le ticket créé.
 *
 * - lookbackDays : fenêtre (en jours) pour agréger les alertes FAILED
 *   quand on (re)génère la liste des templates.
 */
export interface BackupKanbanSettings {
  titlePattern: string;
  categoryId: string | null;
  subcategoryId: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lookbackDays: number;
}

/**
 * Visibilité globale des onglets du portail client. Contrôlée par les
 * admins MSP depuis Paramètres → Portail. Permet de cacher/montrer un
 * onglet sans toucher aux permissions par-org/par-contact existantes
 * (qui restent appliquées en plus).
 *
 * Sémantique :
 *   - tab masquée globalement (false) → JAMAIS rendue, peu importe les
 *     permissions de l'utilisateur portail
 *   - tab visible globalement (true) → la visibilité finale dépend des
 *     règles habituelles (adminOnly, requiresPermission, isApprover)
 *
 * V1 par défaut (ce qui apparaît immédiatement après le déploiement) :
 *   home, tickets, approvals, assets, reports, contacts.
 *   Tout le reste (projets, finances, particularités, politiques,
 *   logiciels, changements, échéances, budget) est masqué — l'admin
 *   les ouvre quand testés et prêts.
 */
export interface PortalNavSettings {
  tabs: {
    home: boolean;
    tickets: boolean;
    approvals: boolean;
    assets: boolean;
    projects: boolean;
    reports: boolean;
    finances: boolean;
    contacts: boolean;
    particularities: boolean;
    policies: boolean;
    software: boolean;
    changes: boolean;
    renewals: boolean;
    budget: boolean;
  };
}

const DEFAULTS: {
  "portal.branding": PortalBranding;
  "regional": RegionalSettings;
  "tickets": TicketSettings;
  "backup-kanban": BackupKanbanSettings;
  "portal.nav": PortalNavSettings;
} = {
  "portal.branding": {
    logo: null,
    primaryColor: "#2563EB",
    companyName: "Nexus",
  },
  "regional": {
    timezone: "america_montreal",
    language: "fr",
    dateFormat: "dd_mm_yyyy",
  },
  "tickets": {
    numberingPrefix: "TK-",
    defaultPriority: "medium",
    defaultQueue: "general",
    autoCloseDays: 7,
  },
  "backup-kanban": {
    titlePattern: "Sauvegardes en échec — {clientName}",
    categoryId: null,
    subcategoryId: null,
    priority: "HIGH",
    lookbackDays: 7,
  },
  "portal.nav": {
    tabs: {
      // V1 ON par défaut — onglets stables, prêts production.
      home: true,
      tickets: true,
      approvals: true,
      assets: true,
      reports: true,
      contacts: true,
      // V1 OFF par défaut — non testés / pas prêts. L'admin les ouvre
      // quand validés (paramètres → Portail).
      projects: false,
      finances: false,
      particularities: false,
      policies: false,
      software: false,
      changes: false,
      renewals: false,
      budget: false,
    },
  },
};

export async function getSetting<K extends keyof typeof DEFAULTS>(
  key: K
): Promise<(typeof DEFAULTS)[K]> {
  const row = await prisma.tenantSetting.findUnique({ where: { key } });
  if (!row) return DEFAULTS[key];
  return { ...DEFAULTS[key], ...(row.value as object) } as (typeof DEFAULTS)[K];
}

export async function setSetting<K extends keyof typeof DEFAULTS>(
  key: K,
  value: Partial<(typeof DEFAULTS)[K]>
): Promise<(typeof DEFAULTS)[K]> {
  const current = await getSetting(key);
  const merged = { ...current, ...value };
  // Cast vers InputJsonValue — Prisma exige un type sérialisable JSON, et
  // nos PortalBranding sont composés de strings/null donc bien sérialisables.
  const jsonValue = merged as unknown as import("@prisma/client").Prisma.InputJsonValue;
  await prisma.tenantSetting.upsert({
    where: { key },
    update: { value: jsonValue },
    create: { key, value: jsonValue },
  });
  return merged;
}

export async function getPortalBranding(): Promise<PortalBranding> {
  return getSetting("portal.branding");
}

export async function getPortalNavSettings(): Promise<PortalNavSettings> {
  return getSetting("portal.nav");
}

// ----------------------------------------------------------------------------
// Ticket prefix helpers — évite de relire les settings à chaque ticket
// affiché (la query /tickets peut retourner 500 rows). Cache 60s en mémoire.
// ----------------------------------------------------------------------------

let _prefixCache: { value: string; at: number } | null = null;
const PREFIX_TTL = 60_000;

/**
 * Préfixe configurable pour les tickets clients (non internes).
 * Default = "TK-". Pour les tickets internes, on utilise toujours "INT-"
 * (non configurable — c'est une distinction métier, pas un paramètre).
 */
export async function getClientTicketPrefix(): Promise<string> {
  const now = Date.now();
  if (_prefixCache && now - _prefixCache.at < PREFIX_TTL) {
    return _prefixCache.value;
  }
  const settings = await getSetting("tickets");
  const value = (settings.numberingPrefix || "TK-").trim() || "TK-";
  _prefixCache = { value, at: now };
  return value;
}

/** Invalide le cache du préfixe — à appeler après un update des settings. */
export function invalidateTicketPrefixCache() {
  _prefixCache = null;
}

/**
 * Formatte un numéro de ticket affichable :
 *   - interne → "INT-NNNN"
 *   - client  → "{clientPrefix}NNNN" (ex: "TK-1001")
 *
 * rawNumber : la colonne int auto-incrément `tickets.number`.
 * clientPrefix : passé explicitement pour permettre un appel sans await
 * (batch) ; utiliser getClientTicketPrefix() pour le récupérer une fois
 * par requête puis passer ici.
 */
export function formatTicketNumber(
  rawNumber: number,
  isInternal: boolean,
  clientPrefix: string,
): string {
  const padded = 1000 + rawNumber;
  if (isInternal) return `INT-${padded}`;
  // Prefix déjà suffixé "-" par convention (ex: "TK-"), mais on tolère
  // l'omission — certains users retireraient le tiret par mégarde.
  const p = clientPrefix.endsWith("-") ? clientPrefix : `${clientPrefix}-`;
  return `${p}${padded}`;
}
