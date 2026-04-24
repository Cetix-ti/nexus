// ============================================================================
// Contract-mapper — convertit la row Prisma `Contract` (enum uppercase +
// settings JSON libre) en `Contract` typé du domaine facturation (enum
// lowercase avec hourBank / mspPlan attachés). C'est l'unique endroit où
// la traduction est faite ; toutes les pages et API qui consomment un
// contrat pour le moteur passent par `toEngineContract`.
// ============================================================================

import type { Contract as PrismaContract } from "@prisma/client";
import type {
  Contract,
  ContractType,
  ContractStatus,
  HourBankSettings,
  MSPPlanSettings,
} from "./types";

/**
 * Déduit un type "engine" (enum lowercase) à partir du type Prisma.
 * Priorité au JSON `settings.engineType` s'il est présent — il permet
 * d'exprimer plus finement que les 5 valeurs Prisma (ex: ftig).
 */
function resolveEngineType(
  prismaType: PrismaContract["type"],
  settings: any,
): ContractType {
  if (settings?.engineType && typeof settings.engineType === "string") {
    return settings.engineType as ContractType;
  }
  switch (prismaType) {
    case "MANAGED_SERVICES": return "msp_monthly";
    case "RETAINER":         return "hour_bank";
    case "HOURLY":           return "time_and_materials";
    case "PROJECT":          return "time_and_materials";
    case "SUPPORT":          return "time_and_materials";
    default:                 return "time_and_materials";
  }
}

function resolveEngineStatus(prismaStatus: PrismaContract["status"]): ContractStatus {
  switch (prismaStatus) {
    case "DRAFT":     return "draft";
    case "ACTIVE":    return "active";
    case "EXPIRING":  return "expiring_soon";
    case "EXPIRED":   return "expired";
    case "CANCELLED": return "cancelled";
    default:          return "active";
  }
}

export function toEngineContract(
  row: PrismaContract,
  organizationName?: string,
): Contract {
  const settings = (row.settings ?? {}) as any;
  const type = resolveEngineType(row.type, settings);

  const hourBank: HourBankSettings | undefined = settings.hourBank
    ? {
        totalHoursPurchased: Number(settings.hourBank.totalHoursPurchased ?? 0),
        hoursConsumed: Number(settings.hourBank.hoursConsumed ?? 0),
        eligibleTimeTypes: settings.hourBank.eligibleTimeTypes ?? [
          "remote_work", "onsite_work", "preparation", "follow_up", "other",
        ],
        carryOverHours: settings.hourBank.carryOverHours ?? false,
        allowOverage: settings.hourBank.allowOverage ?? true,
        overageRate: Number(settings.hourBank.overageRate ?? row.hourlyRate ?? 0),
        includesTravel: settings.hourBank.includesTravel ?? false,
        includesOnsite: settings.hourBank.includesOnsite ?? true,
        validFrom: settings.hourBank.validFrom ?? row.startDate.toISOString(),
        validTo: settings.hourBank.validTo ?? (row.endDate?.toISOString() ?? ""),
      }
    : undefined;

  const mspPlan: MSPPlanSettings | undefined = settings.mspPlan
    ? {
        monthlyAmount: Number(settings.mspPlan.monthlyAmount ?? 0),
        includedTimeTypes: settings.mspPlan.includedTimeTypes ?? [
          "remote_work", "onsite_work", "preparation", "administration", "follow_up",
        ],
        includesRemoteSupport: settings.mspPlan.includesRemoteSupport ?? true,
        includesOnsiteSupport: settings.mspPlan.includesOnsiteSupport ?? true,
        includesTravel: settings.mspPlan.includesTravel ?? false,
        includesKilometers: settings.mspPlan.includesKilometers ?? false,
        includesUrgent: settings.mspPlan.includesUrgent ?? false,
        includesAfterHours: settings.mspPlan.includesAfterHours ?? false,
        includesProjects: settings.mspPlan.includesProjects ?? false,
        includesRecurringWork: settings.mspPlan.includesRecurringWork ?? true,
        hasMonthlyCap: settings.mspPlan.hasMonthlyCap ?? false,
        monthlyCapHours: settings.mspPlan.monthlyCapHours,
        excludedCategoryIds: settings.mspPlan.excludedCategoryIds ?? [],
        customExceptions: settings.mspPlan.customExceptions ?? [],
      }
    : undefined;

  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: organizationName ?? "",
    name: row.name,
    contractNumber: settings.contractNumber ?? row.id.slice(-8).toUpperCase(),
    type,
    status: resolveEngineStatus(row.status),
    billingProfileId: settings.billingProfileId ?? "default",
    startDate: row.startDate.toISOString(),
    endDate: row.endDate?.toISOString(),
    description: row.notes ?? "",
    hourBank,
    mspPlan,
    autoRenew: settings.autoRenew ?? false,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Sélectionne le contrat "actif" à appliquer pour une entrée à une date
 * donnée. Règle : status=ACTIVE, date dans [startDate, endDate?]. Si
 * plusieurs, on prend le plus récemment mis à jour (dernière config gagne).
 */
export function pickActiveContract(
  rows: PrismaContract[],
  atDate: Date,
): PrismaContract | null {
  const candidates = rows.filter((c) => {
    if (c.status !== "ACTIVE") return false;
    if (c.startDate > atDate) return false;
    if (c.endDate && c.endDate < atDate) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return candidates[0];
}
