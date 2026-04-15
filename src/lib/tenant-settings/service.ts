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

const DEFAULTS: {
  "portal.branding": PortalBranding;
  "regional": RegionalSettings;
  "tickets": TicketSettings;
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
