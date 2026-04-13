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
