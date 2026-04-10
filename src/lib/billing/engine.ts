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
  ClientBillingOverride,
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
}

/**
 * Compute the applicable hourly rate based on context.
 * Order: forceX > urgent > afterHours/weekend > onsite/remote > standard
 */
function computeRate(ctx: BillingContext): number {
  const p = ctx.billingProfile;
  if (ctx.timeType === "travel") return p.travelRate;
  if (ctx.isUrgent) return p.urgentRate;
  if (ctx.isWeekend) return p.weekendRate;
  if (ctx.isAfterHours) return p.afterHoursRate;
  if (ctx.isOnsite) return p.onsiteRate;
  if (!ctx.isOnsite) return p.remoteRate;
  return p.standardRate;
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
function decideHourBank(
  ctx: BillingContext,
  contract: Contract,
  bank: HourBankSettings
): BillingDecision {
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

  // Check travel inclusion
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
    const rate = bank.overageRate;
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
  const overageAmount = minutesToAmount(overageMinutes, bank.overageRate);
  return {
    status: "hour_bank_overage",
    reason: `${(remainingMinutes / 60).toFixed(2)} h déduites de la banque, ${(
      overageMinutes / 60
    ).toFixed(2)} h facturées en dépassement à ${bank.overageRate.toFixed(2)} $/h`,
    rate: bank.overageRate,
    amount: overageAmount,
    contractId: contract.id,
    appliedRule: "hour_bank.partial_overage",
    warnings: [`Dépassement de ${(overageMinutes / 60).toFixed(2)} h`],
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

  // Check time type inclusion
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

  // Travel handling
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
