// ============================================================================
// org-billing-bridge — pont entre `OrgBillingConfig` (configuré dans l'onglet
// Facturation des organisations) et le moteur de facturation, qui consomme
// des `Contract` typés.
//
// Pourquoi : l'UI de l'onglet Facturation persiste la Banque d'heures et le
// Forfait FTIG dans `OrgBillingConfig.hourBank` / `.ftig` (JSON). Le moteur,
// lui, lit historiquement depuis `Contract.settings`. Sans ce pont, la config
// cliente n'a aucun effet sur les décisions de couverture des saisies.
//
// Approche : on synthétise un `Contract` *virtuel* (id préfixé
// `virtual-orgconfig:`) à la volée, sans rien persister dans la table
// Contract. Le moteur le traite comme un contrat normal. Le préfixe permet
// au caller de router le bump de consommation vers `OrgBillingConfig` au
// lieu de `Contract.settings`.
//
// Précédence : si un `Contract` Prisma actif existe ET que `OrgBillingConfig`
// est aussi actif, le contrat virtuel **remplace** le contrat Prisma — c'est
// l'UI de Facturation qui devient la source de vérité (l'objectif du
// chantier). L'appel reste backward-compat : sans OrgBillingConfig, on
// retombe sur le Contract Prisma classique.
// ============================================================================

import prisma from "@/lib/prisma";
import type { Contract, FtigSettings, HourBankSettings, TimeType } from "./types";

export const VIRTUAL_CONTRACT_PREFIX = "virtual-orgconfig:";

interface OrgBillingConfigShape {
  billingTypes: string[];
  hourBank: any;
  ftig: any;
}

/** Charge la config Facturation persistée pour une org. Retourne null si
 *  aucune row existe. */
export async function loadOrgBillingConfig(
  organizationId: string,
): Promise<OrgBillingConfigShape | null> {
  const row = await prisma.orgBillingConfig.findUnique({
    where: { organizationId },
  });
  if (!row) return null;
  return {
    billingTypes: row.billingTypes ?? [],
    hourBank: row.hourBank,
    ftig: row.ftig,
  };
}

/** Vérifie qu'une plage de dates [from, to?] couvre une date donnée. */
function isWithinRange(atDate: Date, from?: string, to?: string): boolean {
  if (from) {
    const f = new Date(from + (from.length === 10 ? "T00:00:00" : ""));
    if (atDate < f) return false;
  }
  if (to) {
    const t = new Date(to + (to.length === 10 ? "T23:59:59" : ""));
    if (atDate > t) return false;
  }
  return true;
}

/** Calcule la consommation FTIG du mois courant (sur place / soir / déplacements)
 *  à partir des TimeEntry de l'organisation. Pas de cache — c'est la source
 *  de vérité. */
async function computeFtigMonthlyConsumption(
  organizationId: string,
  atDate: Date,
  excludedWorkTypeIds: string[],
): Promise<{
  onsiteHours: number;
  eveningHours: number;
  weekendHours: number;
  travelCount: number;
}> {
  const monthStart = new Date(atDate.getFullYear(), atDate.getMonth(), 1);
  const monthEnd = new Date(atDate.getFullYear(), atDate.getMonth() + 1, 1);

  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId,
      startedAt: { gte: monthStart, lt: monthEnd },
    },
    select: {
      timeType: true,
      durationMinutes: true,
      isOnsite: true,
      isAfterHours: true,
      isWeekend: true,
      hasTravelBilled: true,
      workTypeId: true,
    },
  });

  let onsiteMinutes = 0;
  let eveningMinutes = 0;
  let weekendMinutes = 0;
  let travelCount = 0;
  // `excludedWorkTypeIds` reste passé en argument pour rétro-compatibilité
  // de la signature, mais n'est plus utilisé pour skipper les saisies du
  // calcul de consommation (sémantique cosmétique B).
  void excludedWorkTypeIds;

  for (const e of entries) {
    // Note : les WorkType « hors contrat » consomment AUSSI les quotas
    // depuis Sémantique B (cosmétique uniquement). Avant, ils étaient
    // skippés via continue ici — mais ça créait des trous dans les
    // compteurs et gardait les saisies d'éternellement marquées comme
    // "billable" alors qu'elles aurait dû passer par la cascade jour/soir.
    if (e.timeType === "travel" || e.hasTravelBilled) {
      travelCount += 1;
    }
    if (e.timeType === "internal") continue;
    // Segmentation alignée sur la cascade du moteur :
    //   weekend (peu importe sur place / à distance) → quota weekend
    //   sinon soir + à distance                      → quota soir
    //   sinon soir + sur place                       → billable direct (pas de quota)
    //   sinon jour (sur place OU à distance)         → quota jour
    if (e.isWeekend) {
      weekendMinutes += e.durationMinutes;
    } else if (e.isAfterHours && !e.isOnsite) {
      eveningMinutes += e.durationMinutes;
    } else if (e.isAfterHours && e.isOnsite) {
      // Sur place soir → pas de quota, billable direct. On ne le compte
      // dans aucun consumed*. Continue.
      continue;
    } else if (!e.isAfterHours) {
      // Heures normales — sur place OU à distance — consomment le même
      // quota jour (champ persisté `includedOnsiteHours` mais sémantique
      // « heures de jour » selon la nouvelle règle FTIG).
      onsiteMinutes += e.durationMinutes;
    }
  }

  return {
    onsiteHours: Math.round((onsiteMinutes / 60) * 100) / 100,
    eveningHours: Math.round((eveningMinutes / 60) * 100) / 100,
    weekendHours: Math.round((weekendMinutes / 60) * 100) / 100,
    travelCount,
  };
}

/**
 * Construit un Contract virtuel à partir d'OrgBillingConfig si l'organisation
 * a une config active à la date passée. Retourne null sinon.
 *
 * Précédence interne : FTIG > Banque d'heures (au cas où les deux sont
 * cochés simultanément dans `billingTypes`). Un client qui veut les deux en
 * mode hybride sortira du scope v1.
 */
export async function buildVirtualContractFromOrgConfig(
  organizationId: string,
  atDate: Date,
): Promise<Contract | null> {
  const cfg = await loadOrgBillingConfig(organizationId);
  if (!cfg) return null;

  const hasFtig = cfg.billingTypes.includes("ftig") && cfg.ftig;
  const hasBank = cfg.billingTypes.includes("hour_bank") && cfg.hourBank;

  // FTIG en priorité.
  if (hasFtig) {
    const f = cfg.ftig as Record<string, unknown>;
    const startDate = (f.startDate as string | undefined) ?? "";
    const endDate = (f.endDate as string | undefined) ?? "";
    if (!isWithinRange(atDate, startDate, endDate)) {
      // Forfait pas actif à cette date, on essaie hour_bank en repli.
    } else {
      const excludedWorkTypeIds = Array.isArray(f.excludedWorkTypeIds)
        ? (f.excludedWorkTypeIds as string[]).filter((s) => typeof s === "string")
        : [];
      const consumed = await computeFtigMonthlyConsumption(
        organizationId,
        atDate,
        excludedWorkTypeIds,
      );
      const ftigSettings: FtigSettings = {
        monthlyAmount: Number(f.monthlyAmount ?? 0),
        includedOnsiteHours: Number(f.includedOnsiteHours ?? 0),
        includedEveningHours: Number(f.includedEveningHours ?? 0),
        includedWeekendHours: Number(f.includedWeekendHours ?? 0),
        includedTravelCount: Number(f.includedTravelCount ?? 0),
        consumedOnsiteHours: consumed.onsiteHours,
        consumedEveningHours: consumed.eveningHours,
        consumedWeekendHours: consumed.weekendHours,
        consumedTravelCount: consumed.travelCount,
        excludedWorkTypeIds,
        extraOnsiteRate: Number(f.extraOnsiteHourlyRate ?? 0),
        validFrom: startDate || atDate.toISOString(),
        validTo: endDate || "",
      };
      return {
        id: `${VIRTUAL_CONTRACT_PREFIX}${organizationId}:ftig`,
        organizationId,
        organizationName: "",
        name: "Forfait Technicien IT Garanti",
        contractNumber: "FTIG",
        type: "ftig",
        status: "active",
        billingProfileId: "default",
        startDate: ftigSettings.validFrom,
        endDate: ftigSettings.validTo || undefined,
        description: "Forfait FTIG synthétisé depuis l'onglet Facturation",
        ftig: ftigSettings,
        autoRenew: false,
        createdAt: atDate.toISOString(),
        updatedAt: atDate.toISOString(),
      };
    }
  }

  if (hasBank) {
    const b = cfg.hourBank as Record<string, unknown>;
    const startDate = (b.startDate as string | undefined) ?? "";
    const endDate = (b.endDate as string | undefined) ?? "";
    const carryOver = Boolean(b.carryOver ?? false);
    // Si carryOver=true, la banque reste active même au-delà de la
    // date de fin (les heures restantes se reportent indéfiniment
    // jusqu'à renouvellement manuel). Sinon, le bank n'est plus
    // utilisable une fois validTo dépassé.
    const inRange = carryOver
      ? !startDate || new Date(startDate) <= atDate
      : isWithinRange(atDate, startDate, endDate);
    if (!inRange) return null;

    const eligibleTimeTypes: TimeType[] = [
      "remote_work", "onsite_work", "preparation", "follow_up", "other",
    ];
    const overageRate = Number(b.overageRate ?? b.hourlyRate ?? 0);
    const hourBankSettings: HourBankSettings = {
      totalHoursPurchased: Number(b.totalHours ?? 0),
      hoursConsumed: Number(b.hoursConsumed ?? 0),
      eligibleTimeTypes,
      carryOverHours: Boolean(b.carryOver ?? false),
      allowOverage: true,
      overageRate,
      extraTravelRate: Number(b.extraTravelRate ?? 0) || undefined,
      extraOnsiteRate: Number(b.extraOnsiteRate ?? 0) || undefined,
      extraEveningRate: Number(b.extraEveningRate ?? 0) || undefined,
      includesTravel: Number(b.includedTravelCount ?? 0) > 0,
      includesOnsite: Number(b.includedOnsiteHours ?? 0) > 0 || true,
      validFrom: startDate || atDate.toISOString(),
      validTo: endDate || "",
    };
    return {
      id: `${VIRTUAL_CONTRACT_PREFIX}${organizationId}:hour_bank`,
      organizationId,
      organizationName: "",
      name: "Banque d'heures",
      contractNumber: "BANK",
      type: "hour_bank",
      status: "active",
      billingProfileId: "default",
      startDate: hourBankSettings.validFrom,
      endDate: hourBankSettings.validTo || undefined,
      description: "Banque d'heures synthétisée depuis l'onglet Facturation",
      hourBank: hourBankSettings,
      autoRenew: false,
      createdAt: atDate.toISOString(),
      updatedAt: atDate.toISOString(),
    };
  }

  return null;
}

/** Détecte si un id de contrat est un id virtuel généré par ce module. */
export function isVirtualContractId(contractId: string): boolean {
  return contractId.startsWith(VIRTUAL_CONTRACT_PREFIX);
}

/**
 * Incrémente atomiquement `OrgBillingConfig.hourBank.hoursConsumed` (équivalent
 * de `bumpContractHourBank` mais pour le chemin virtuel). Opère en
 * transaction lecture+écriture pour éviter les races.
 */
export async function bumpOrgBillingConfigHourBank(
  organizationId: string,
  minutes: number,
): Promise<void> {
  if (minutes <= 0) return;
  const hoursDelta = minutes / 60;
  await prisma.$transaction(async (tx) => {
    const row = await tx.orgBillingConfig.findUnique({
      where: { organizationId },
      select: { hourBank: true },
    });
    if (!row || !row.hourBank) return;
    const cur = row.hourBank as Record<string, unknown>;
    const prev = Number(cur.hoursConsumed ?? 0);
    const next = {
      ...cur,
      hoursConsumed: Math.round((prev + hoursDelta) * 100) / 100,
    };
    await tx.orgBillingConfig.update({
      where: { organizationId },
      data: { hourBank: next as never },
    });
  });
}
