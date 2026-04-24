// ============================================================================
// server-decide — revalidation serveur de la facturation d'une TimeEntry.
//
// Principe : la modale de saisie calcule le décision côté client pour
// l'aperçu, mais le serveur DOIT refaire le calcul avec l'état actuel du
// profil de facturation + contrat. Sinon, un client compromis (ou un bug
// d'UI) pourrait stocker n'importe quel hourlyRate / amount.
//
// De plus, quand l'entrée est "deducted_from_hour_bank" ou
// "hour_bank_overage", on met à jour atomiquement
// `Contract.settings.hourBank.hoursConsumed` pour que le solde de la
// banque reste cohérent entre toutes les sessions et tous les agents.
// ============================================================================

import prisma from "@/lib/prisma";
import { decideBilling } from "./engine";
import { resolveClientBillingProfile } from "./engine";
import {
  mockBillingProfiles,
  getClientBillingOverride,
} from "./mock-data";
import { toEngineContract, pickActiveContract } from "./contract-mapper";
import type { BillingDecision, Contract, TimeType } from "./types";

interface DecideInput {
  organizationId: string;
  timeType: string;
  durationMinutes: number;
  startedAt: Date;
  isOnsite?: boolean;
  isAfterHours?: boolean;
  isWeekend?: boolean;
  isUrgent?: boolean;
  ticketCategoryId?: string;
  forceNonBillable?: boolean;
  forceBillable?: boolean;
}

export interface ServerDecision {
  decision: BillingDecision;
  contract: Contract | null;
}

/**
 * Résout le profil de facturation et le contrat actifs pour l'organisation,
 * puis exécute decideBilling() avec ces données. Retourne la décision et
 * le contrat choisi (utilisé par le caller pour déduire de la banque).
 */
export async function resolveDecisionForEntry(input: DecideInput): Promise<ServerDecision> {
  // 1. Profil de facturation (base + override éventuel, source actuelle = mocks
  //    + localStorage côté serveur, futur = Prisma). En attendant une migration
  //    complète, on utilise le même in-memory que /api/v1/organizations/[id]/billing.
  const override = getClientBillingOverride(input.organizationId);
  const baseProfile =
    (override && mockBillingProfiles.find((p) => p.id === override.baseProfileId)) ||
    mockBillingProfiles.find((p) => p.isDefault) ||
    mockBillingProfiles[0];
  if (!baseProfile) {
    // Ultime fallback : aucun profil configuré → non facturable.
    return {
      decision: {
        status: "non_billable",
        reason: "Aucun profil de facturation configuré — entrée marquée non facturable",
        appliedRule: "server.no_profile",
      },
      contract: null,
    };
  }
  const billingProfile = resolveClientBillingProfile(baseProfile, override);

  // 2. Contrat actif à la date de l'entrée.
  const contractRows = await prisma.contract.findMany({
    where: { organizationId: input.organizationId },
  });
  const activeRow = pickActiveContract(contractRows, input.startedAt);
  const contract = activeRow ? toEngineContract(activeRow) : null;

  // 3. Décision.
  const decision = decideBilling({
    timeType: input.timeType as TimeType,
    durationMinutes: input.durationMinutes,
    isOnsite: input.isOnsite ?? false,
    isAfterHours: input.isAfterHours ?? false,
    isWeekend: input.isWeekend ?? false,
    isUrgent: input.isUrgent ?? false,
    ticketCategoryId: input.ticketCategoryId,
    organizationId: input.organizationId,
    contract: contract ?? undefined,
    billingProfile,
    forceNonBillable: input.forceNonBillable,
    forceBillable: input.forceBillable,
  });

  return { decision, contract };
}

/**
 * Incrémente atomiquement `hoursConsumed` de la banque d'heures d'un
 * contrat Prisma. N'agit que si le type d'entrée est effectivement déduit
 * de la banque (status = deducted_from_hour_bank ou hour_bank_overage).
 *
 * Opère via un findUnique + update (2 requêtes) en transaction pour
 * préserver la cohérence même si plusieurs saisies arrivent en parallèle.
 */
export async function bumpContractHourBank(
  contractId: string,
  minutes: number,
): Promise<void> {
  if (minutes <= 0) return;
  const hoursDelta = minutes / 60;
  await prisma.$transaction(async (tx) => {
    const row = await tx.contract.findUnique({
      where: { id: contractId },
      select: { settings: true },
    });
    if (!row) return;
    const settings: any = row.settings ?? {};
    if (!settings.hourBank) return; // contrat n'est plus "hour_bank"
    const prev = Number(settings.hourBank.hoursConsumed ?? 0);
    settings.hourBank = {
      ...settings.hourBank,
      hoursConsumed: Math.round((prev + hoursDelta) * 100) / 100,
    };
    await tx.contract.update({
      where: { id: contractId },
      data: { settings },
    });
  });
}
