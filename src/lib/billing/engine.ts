// ============================================================================
// NEXUS BILLING ENGINE
// Decides coverage status, rate and amount for a time/travel/expense entry
// based on the contract, billing profile and contextual rules.
// ============================================================================

import type {
  TimeType,
  CoverageStatus,
  BillingDecision,
  Contract,
  BillingProfile,
  HourBankSettings,
  MSPPlanSettings,
  FtigSettings,
  ClientBillingOverride,
  BillingCoverageMode,
  ResolvedBillingProfile,
} from "./types";

/**
 * Resolve the effective billing profile for a client, merging the base with the override.
 */
export function resolveClientBillingProfile(
  baseProfile: BillingProfile,
  override?: ClientBillingOverride
): ResolvedBillingProfile {
  if (!override) {
    return {
      ...baseProfile,
      baseProfileId: baseProfile.id,
      hasOverride: false,
      overriddenFields: [],
    };
  }
  const overriddenFields: string[] = [];
  const merged: ResolvedBillingProfile = {
    ...baseProfile,
    baseProfileId: baseProfile.id,
    hasOverride: true,
    overriddenFields,
  };
  const fields: (keyof ClientBillingOverride)[] = [
    "standardRate", "onsiteRate", "remoteRate", "urgentRate",
    "afterHoursRate", "weekendRate", "travelRate", "ratePerKm",
    "travelFlatFee", "hourBankOverageRate", "mspExcludedRate",
    "minimumBillableMinutes", "roundingIncrementMinutes",
  ];
  for (const f of fields) {
    if (override[f] !== undefined && override[f] !== null) {
      (merged as any)[f] = override[f];
      overriddenFields.push(f as string);
    }
  }
  return merged;
}

interface BillingContext {
  timeType: TimeType;
  durationMinutes: number;
  isOnsite: boolean;
  isAfterHours: boolean;
  isWeekend: boolean;
  isUrgent: boolean;
  ticketCategoryId?: string;
  organizationId: string;
  contract?: Contract;
  billingProfile: BillingProfile;
  forceNonBillable?: boolean;
  forceBillable?: boolean;
  // --- Stratégie tarifaire client ----------------------------------------
  /** Couverture du télétravail pour ce client. */
  remoteCoverage?: BillingCoverageMode;
  /** Couverture du sur-place pour ce client. */
  onsiteCoverage?: BillingCoverageMode;
  /** Multiplicateur soir (default 1.5). */
  afterHoursMultiplier?: number;
  /** Multiplicateur weekend (default 2.0). */
  weekendMultiplier?: number;
  /** Taux du libellé de travail choisi par l'agent (si défini, sert de
   *  base au lieu de standardRate/onsiteRate/remoteRate). Les multiplicateurs
   *  soir/weekend s'appliquent par-dessus. */
  workTypeRate?: number | null;
}

/**
 * Compute the applicable hourly rate based on context.
 *
 * Règle métier (services professionnels / T&M — catégorie de base) :
 *   - Weekend  → taux standard × 2
 *   - De soir  → taux standard × 1,5
 *   - Urgence  → urgentRate (taux explicite du profil)
 *   - Sur place → onsiteRate, sinon remoteRate
 *
 * Les multiplicateurs 1,5× / 2× ne s'appliquent QU'ICI (computeRate) et
 * donc uniquement dans les paths T&M de decideBilling — les contrats
 * hour_bank (overageRate) et MSP monthly (mspExcludedRate / rates de
 * dépassement spécifiques) gardent leur logique propre.
 *
 * Weekend prime sur After-hours si les deux sont cochés (cas samedi
 * soir : le coefficient 2× l'emporte).
 */
function computeRate(ctx: BillingContext): number {
  const p = ctx.billingProfile;
  if (ctx.timeType === "travel") return p.travelRate;
  if (ctx.isUrgent) return p.urgentRate;
  // Multiplicateurs configurables par client (défauts 1.5x soir, 2x weekend).
  const ahMult = ctx.afterHoursMultiplier ?? 1.5;
  const weMult = ctx.weekendMultiplier ?? 2.0;
  // Taux de base : libellé client choisi à la saisie (`workTypeRate`),
  // sinon scalaire du profil selon onsite/remote.
  const baseRate =
    (ctx.workTypeRate ?? null) != null
      ? (ctx.workTypeRate as number)
      : ctx.isOnsite
        ? p.onsiteRate
        : p.remoteRate;
  // Weekend prime sur after-hours si les deux sont cochés.
  if (ctx.isWeekend) return baseRate * weMult;
  if (ctx.isAfterHours) return baseRate * ahMult;
  return baseRate;
}

function applyMinimumAndRounding(
  minutes: number,
  profile: BillingProfile
): number {
  let m = Math.max(minutes, profile.minimumBillableMinutes);
  const inc = profile.roundingIncrementMinutes;
  if (inc > 1) {
    m = Math.ceil(m / inc) * inc;
  }
  return m;
}

function minutesToAmount(minutes: number, hourlyRate: number): number {
  return Math.round((minutes / 60) * hourlyRate * 100) / 100;
}

// ----------------------------------------------------------------------------
// HOUR BANK LOGIC
// ----------------------------------------------------------------------------

/** Choisit le taux de dépassement applicable selon le contexte de l'entrée :
 *  déplacement, sur place, soir/weekend, ou cas standard. Les taux
 *  contextuels supplantent `overageRate` quand ils sont configurés (>0). */
function pickHourBankOverageRate(ctx: BillingContext, bank: HourBankSettings): number {
  if (ctx.timeType === "travel" && bank.extraTravelRate && bank.extraTravelRate > 0) {
    return bank.extraTravelRate;
  }
  if ((ctx.isAfterHours || ctx.isWeekend) && bank.extraEveningRate && bank.extraEveningRate > 0) {
    return bank.extraEveningRate;
  }
  if (ctx.isOnsite && bank.extraOnsiteRate && bank.extraOnsiteRate > 0) {
    return bank.extraOnsiteRate;
  }
  return bank.overageRate;
}

function decideHourBank(
  ctx: BillingContext,
  contract: Contract,
  bank: HourBankSettings
): BillingDecision {
  // Les déplacements ont une sémantique propre (taux travel, catégorie
  // "travel_billable" pour le reporting). On les traite AVANT le check
  // d'éligibilité du timeType — sinon un travel non éligible tombe dans
  // "billable" au lieu de "travel_billable".
  if (ctx.timeType === "travel" && !bank.includesTravel) {
    const rate = ctx.billingProfile.travelRate;
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "travel_billable",
      reason: "Le déplacement n'est pas inclus dans la banque d'heures",
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "hour_bank.travel_excluded",
    };
  }

  // Check if this time type is eligible for the bank
  if (!bank.eligibleTimeTypes.includes(ctx.timeType)) {
    // Falls back to billable extra at standard rate
    const rate = computeRate(ctx);
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "billable",
      reason: `Type de temps « ${ctx.timeType} » non admissible à la banque d'heures du contrat`,
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "hour_bank.ineligible_type",
    };
  }

  // Check onsite inclusion
  if (ctx.isOnsite && !bank.includesOnsite) {
    const rate = ctx.billingProfile.onsiteRate;
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "billable",
      reason: "Le travail sur site n'est pas inclus dans la banque d'heures",
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "hour_bank.onsite_excluded",
    };
  }

  // Compute remaining hours in bank
  const remainingMinutes =
    bank.totalHoursPurchased * 60 - bank.hoursConsumed * 60;
  const billable = applyMinimumAndRounding(
    ctx.durationMinutes,
    ctx.billingProfile
  );

  if (remainingMinutes >= billable) {
    // Fully covered by hour bank
    return {
      status: "deducted_from_hour_bank",
      reason: `Déduit de la banque d'heures (${(
        remainingMinutes / 60
      ).toFixed(2)} h restantes avant déduction)`,
      contractId: contract.id,
      appliedRule: "hour_bank.deducted",
    };
  }

  if (remainingMinutes <= 0) {
    // Entire entry is overage
    if (!bank.allowOverage) {
      return {
        status: "non_billable",
        reason: "La banque d'heures est épuisée et le dépassement n'est pas autorisé",
        contractId: contract.id,
        appliedRule: "hour_bank.exhausted_no_overage",
        warnings: ["Banque d'heures épuisée — entrée bloquée"],
      };
    }
    const rate = pickHourBankOverageRate(ctx, bank);
    return {
      status: "hour_bank_overage",
      reason: `Banque d'heures épuisée — facturé en dépassement à ${rate.toFixed(2)} $/h`,
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "hour_bank.full_overage",
      warnings: ["Banque d'heures épuisée"],
    };
  }

  // Partial overage: some minutes covered, some in overage
  // For simplicity, we report as overage with a warning describing the split.
  if (!bank.allowOverage) {
    return {
      status: "non_billable",
      reason: `Solde insuffisant dans la banque (${(
        remainingMinutes / 60
      ).toFixed(2)} h restantes) et dépassement non autorisé`,
      contractId: contract.id,
      appliedRule: "hour_bank.partial_no_overage",
      warnings: [`Seules ${(remainingMinutes / 60).toFixed(2)} h disponibles`],
    };
  }

  const overageMinutes = billable - remainingMinutes;
  const overageRate = pickHourBankOverageRate(ctx, bank);
  const overageAmount = minutesToAmount(overageMinutes, overageRate);
  return {
    status: "hour_bank_overage",
    reason: `${(remainingMinutes / 60).toFixed(2)} h déduites de la banque, ${(
      overageMinutes / 60
    ).toFixed(2)} h facturées en dépassement à ${overageRate.toFixed(2)} $/h`,
    rate: overageRate,
    amount: overageAmount,
    contractId: contract.id,
    appliedRule: "hour_bank.partial_overage",
    warnings: [`Dépassement de ${(overageMinutes / 60).toFixed(2)} h`],
  };
}

// ----------------------------------------------------------------------------
// FTIG LOGIC — Forfait Technicien IT Garanti
//
// Mensualité fixe + inclusions plafonnées par mois (onsite, soir/weekend,
// déplacements). Le téletravail standard est toujours inclus. Les flags
// "onsite", "after-hours/weekend" et le timeType "travel" consomment leur
// quota respectif. Au-delà du quota, on bascule au taux `extraOnsiteRate`.
//
// La consommation du mois courant est pré-calculée par `server-decide.ts`
// à partir des TimeEntry de la période — pas de compteurs persistés.
// ----------------------------------------------------------------------------
function decideFtig(
  ctx: BillingContext,
  contract: Contract,
  ftig: FtigSettings,
): BillingDecision {
  // Déplacement : compteur de quantité (pas d'heures).
  if (ctx.timeType === "travel") {
    if (ftig.consumedTravelCount < ftig.includedTravelCount) {
      return {
        status: "included_in_contract",
        reason: `Déplacement inclus dans le forfait FTIG (${ftig.consumedTravelCount + 1}/${ftig.includedTravelCount} ce mois)`,
        contractId: contract.id,
        appliedRule: "ftig.travel_included",
      };
    }
    const rate = ctx.billingProfile.travelRate;
    const billable = applyMinimumAndRounding(ctx.durationMinutes, ctx.billingProfile);
    return {
      status: "travel_billable",
      reason: `Déplacements inclus du mois épuisés (${ftig.includedTravelCount}/${ftig.includedTravelCount}) — facturé au taux déplacement`,
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "ftig.travel_overage",
      warnings: ["Quota déplacements FTIG épuisé"],
    };
  }

  const billable = applyMinimumAndRounding(ctx.durationMinutes, ctx.billingProfile);

  // Soir / weekend : consomment le quota "evening" (les deux sont traités
  // comme une seule banque "hors heures normales" pour rester simple).
  if (ctx.isAfterHours || ctx.isWeekend) {
    const remainingMinutes = Math.max(0, (ftig.includedEveningHours - ftig.consumedEveningHours) * 60);
    if (remainingMinutes >= billable) {
      return {
        status: "included_in_contract",
        reason: `Heures de soir/weekend incluses dans le forfait FTIG (${(remainingMinutes / 60).toFixed(2)} h restantes ce mois)`,
        contractId: contract.id,
        appliedRule: "ftig.evening_included",
      };
    }
    const rate = ftig.extraOnsiteRate > 0
      ? ftig.extraOnsiteRate
      : (ctx.isWeekend ? ctx.billingProfile.weekendRate : ctx.billingProfile.afterHoursRate);
    if (remainingMinutes <= 0) {
      return {
        status: "billable",
        reason: `Quota soir/weekend FTIG épuisé (${ftig.includedEveningHours} h/mois) — facturé à ${rate.toFixed(2)} $/h`,
        rate,
        amount: minutesToAmount(billable, rate),
        contractId: contract.id,
        appliedRule: "ftig.evening_overage",
        warnings: ["Quota heures soir FTIG épuisé"],
      };
    }
    // Partial overage — surplus seul facturé, partie incluse non facturée.
    const overageMinutes = billable - remainingMinutes;
    return {
      status: "billable",
      reason: `${(remainingMinutes / 60).toFixed(2)} h incluses au forfait, ${(overageMinutes / 60).toFixed(2)} h facturées à ${rate.toFixed(2)} $/h`,
      rate,
      amount: minutesToAmount(overageMinutes, rate),
      contractId: contract.id,
      appliedRule: "ftig.evening_partial_overage",
      warnings: [`Dépassement quota soir : ${(overageMinutes / 60).toFixed(2)} h`],
    };
  }

  // Sur place (heures normales) : consomme le quota "onsite".
  if (ctx.isOnsite) {
    const remainingMinutes = Math.max(0, (ftig.includedOnsiteHours - ftig.consumedOnsiteHours) * 60);
    if (remainingMinutes >= billable) {
      return {
        status: "included_in_contract",
        reason: `Heures sur place incluses dans le forfait FTIG (${(remainingMinutes / 60).toFixed(2)} h restantes ce mois)`,
        contractId: contract.id,
        appliedRule: "ftig.onsite_included",
      };
    }
    const rate = ftig.extraOnsiteRate > 0 ? ftig.extraOnsiteRate : ctx.billingProfile.onsiteRate;
    if (remainingMinutes <= 0) {
      return {
        status: "billable",
        reason: `Quota sur place FTIG épuisé (${ftig.includedOnsiteHours} h/mois) — facturé à ${rate.toFixed(2)} $/h`,
        rate,
        amount: minutesToAmount(billable, rate),
        contractId: contract.id,
        appliedRule: "ftig.onsite_overage",
        warnings: ["Quota heures sur place FTIG épuisé"],
      };
    }
    const overageMinutes = billable - remainingMinutes;
    return {
      status: "billable",
      reason: `${(remainingMinutes / 60).toFixed(2)} h incluses au forfait, ${(overageMinutes / 60).toFixed(2)} h facturées à ${rate.toFixed(2)} $/h`,
      rate,
      amount: minutesToAmount(overageMinutes, rate),
      contractId: contract.id,
      appliedRule: "ftig.onsite_partial_overage",
      warnings: [`Dépassement quota sur place : ${(overageMinutes / 60).toFixed(2)} h`],
    };
  }

  // Télétravail standard heures normales : couvert par le forfait, sans
  // plafond. C'est la promesse marketing du FTIG.
  return {
    status: "included_in_contract",
    reason: "Inclus dans le forfait FTIG (télétravail standard)",
    contractId: contract.id,
    appliedRule: "ftig.remote_included",
  };
}

// ----------------------------------------------------------------------------
// MSP MONTHLY PLAN LOGIC
// ----------------------------------------------------------------------------
function decideMSPPlan(
  ctx: BillingContext,
  contract: Contract,
  plan: MSPPlanSettings
): BillingDecision {
  // Check excluded categories first
  if (
    ctx.ticketCategoryId &&
    plan.excludedCategoryIds.includes(ctx.ticketCategoryId)
  ) {
    const rate = ctx.billingProfile.mspExcludedRate;
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "msp_overage",
      reason: "Catégorie de ticket explicitement exclue du forfait MSP",
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "msp.excluded_category",
    };
  }

  // Travel handling — AVANT le check includedTimeTypes pour que la
  // sémantique "déplacement" (status travel_billable, taux travelRate)
  // prenne précédence sur la règle générique "type non inclus".
  if (ctx.timeType === "travel") {
    if (!plan.includesTravel) {
      const rate = ctx.billingProfile.travelRate;
      const billable = applyMinimumAndRounding(
        ctx.durationMinutes,
        ctx.billingProfile
      );
      return {
        status: "travel_billable",
        reason: "Déplacement non inclus dans le forfait MSP",
        rate,
        amount: minutesToAmount(billable, rate),
        contractId: contract.id,
        appliedRule: "msp.travel_excluded",
      };
    }
    return {
      status: "included_in_contract",
      reason: "Déplacement inclus dans le forfait MSP",
      contractId: contract.id,
      appliedRule: "msp.travel_included",
    };
  }

  // Check time type inclusion (pour les types non-travel)
  if (!plan.includedTimeTypes.includes(ctx.timeType)) {
    const rate = ctx.billingProfile.mspExcludedRate;
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "msp_overage",
      reason: `Type de temps « ${ctx.timeType} » non inclus dans le forfait MSP`,
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "msp.excluded_time_type",
    };
  }

  // Onsite vs remote inclusion
  if (ctx.isOnsite && !plan.includesOnsiteSupport) {
    const rate = ctx.billingProfile.onsiteRate;
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "msp_overage",
      reason: "Support sur site non inclus dans le forfait MSP",
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "msp.onsite_excluded",
    };
  }

  if (!ctx.isOnsite && !plan.includesRemoteSupport) {
    const rate = ctx.billingProfile.remoteRate;
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "msp_overage",
      reason: "Support à distance non inclus dans le forfait MSP",
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "msp.remote_excluded",
    };
  }

  // After-hours / weekend / urgent special handling
  if (ctx.isUrgent && !plan.includesUrgent) {
    const rate = ctx.billingProfile.urgentRate;
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "msp_overage",
      reason: "Intervention urgente non incluse dans le forfait MSP",
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "msp.urgent_excluded",
    };
  }

  if ((ctx.isAfterHours || ctx.isWeekend) && !plan.includesAfterHours) {
    const rate = ctx.isWeekend
      ? ctx.billingProfile.weekendRate
      : ctx.billingProfile.afterHoursRate;
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "msp_overage",
      reason: `Intervention ${
        ctx.isWeekend ? "le week-end" : "après les heures"
      } non incluse dans le forfait MSP`,
      rate,
      amount: minutesToAmount(billable, rate),
      contractId: contract.id,
      appliedRule: "msp.after_hours_excluded",
    };
  }

  // All checks passed → included in contract
  return {
    status: "included_in_contract",
    reason: "Inclus dans le forfait MSP mensuel",
    contractId: contract.id,
    appliedRule: "msp.included",
  };
}

// ----------------------------------------------------------------------------
// MAIN ENTRY POINT
// ----------------------------------------------------------------------------
export function decideBilling(ctx: BillingContext): BillingDecision {
  // Manual overrides take precedence
  if (ctx.forceNonBillable) {
    return {
      status: "non_billable",
      reason: "Marqué manuellement comme non facturable",
      appliedRule: "manual.non_billable",
    };
  }

  // Internal time is never billable
  if (ctx.timeType === "internal") {
    return {
      status: "internal_time",
      reason: "Temps interne — jamais facturé au client",
      appliedRule: "auto.internal_time",
    };
  }

  // Couverture par mode — règle client. Le télétravail ou le sur-place
  // peuvent être marqués FREE (gratuit) ou INCLUDED (couvert au contrat)
  // au niveau de l'override client. Cette règle prime sur la logique
  // contractuelle (les déplacements gardent leur traitement propre car
  // ils ne sont ni "remote" ni "onsite" au sens de la couverture).
  if (ctx.timeType !== "travel" && !ctx.forceBillable) {
    const mode = ctx.isOnsite
      ? (ctx.onsiteCoverage ?? "BILLABLE")
      : (ctx.remoteCoverage ?? "BILLABLE");
    if (mode === "FREE") {
      return {
        status: "non_billable",
        reason: ctx.isOnsite
          ? "Sur place gratuit pour ce client"
          : "Télétravail gratuit pour ce client",
        appliedRule: "client_coverage.free",
      };
    }
    if (mode === "INCLUDED") {
      return {
        status: "included_in_contract",
        reason: ctx.isOnsite
          ? "Sur place inclus dans le forfait du client"
          : "Télétravail inclus dans le forfait du client",
        contractId: ctx.contract?.id,
        appliedRule: "client_coverage.included",
      };
    }
  }

  // No contract → time and materials at standard rate
  if (!ctx.contract) {
    if (
      !ctx.billingProfile.billableTimeTypes.includes(ctx.timeType) &&
      !ctx.forceBillable
    ) {
      return {
        status: "non_billable",
        reason: `Type de temps « ${ctx.timeType} » non facturable selon le profil par défaut`,
        appliedRule: "default.non_billable_type",
      };
    }
    const rate = computeRate(ctx);
    const billable = applyMinimumAndRounding(
      ctx.durationMinutes,
      ctx.billingProfile
    );
    return {
      status: "billable",
      reason: "Aucun contrat — facturation standard",
      rate,
      amount: minutesToAmount(billable, rate),
      appliedRule: "default.no_contract",
    };
  }

  // Contract-based logic
  switch (ctx.contract.type) {
    case "hour_bank":
      if (ctx.contract.hourBank) {
        return decideHourBank(ctx, ctx.contract, ctx.contract.hourBank);
      }
      break;
    case "msp_monthly":
      if (ctx.contract.mspPlan) {
        return decideMSPPlan(ctx, ctx.contract, ctx.contract.mspPlan);
      }
      break;
    case "ftig":
      if (ctx.contract.ftig) {
        return decideFtig(ctx, ctx.contract, ctx.contract.ftig);
      }
      break;
    case "time_and_materials": {
      if (
        !ctx.billingProfile.billableTimeTypes.includes(ctx.timeType) &&
        !ctx.forceBillable
      ) {
        return {
          status: "non_billable",
          reason: "Type de temps non facturable selon le profil",
          contractId: ctx.contract.id,
          appliedRule: "tm.non_billable_type",
        };
      }
      const rate = computeRate(ctx);
      const billable = applyMinimumAndRounding(
        ctx.durationMinutes,
        ctx.billingProfile
      );
      return {
        status: "billable",
        reason: "Contrat Temps & Matériel — facturation au taux applicable",
        rate,
        amount: minutesToAmount(billable, rate),
        contractId: ctx.contract.id,
        appliedRule: "tm.billable",
      };
    }
    case "prepaid_block":
    case "hybrid":
      // Treat as standard for now
      break;
  }

  // Fallback
  const rate = computeRate(ctx);
  const billable = applyMinimumAndRounding(
    ctx.durationMinutes,
    ctx.billingProfile
  );
  return {
    status: "billable",
    reason: "Facturation standard (fallback)",
    rate,
    amount: minutesToAmount(billable, rate),
    contractId: ctx.contract?.id,
    appliedRule: "fallback.billable",
  };
}

export type { BillingContext };
