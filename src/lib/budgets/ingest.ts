// ============================================================================
// Ingestion automatique de lignes budgétaires à partir des sources existantes.
//
// Principe : pour un budget donné (orgId, fiscalYear), parcourt les engagements
// qui ARRIVENT À ÉCHÉANCE pendant l'année fiscale et crée/met à jour des
// lignes AUTO_* avec les montants connus.
//
// Idempotence : re-ingest ne duplique pas — chaque source est matchée par
// (budgetId, source, sourceRefType, sourceRefId). Les lignes déjà COMMITTED/
// INVOICED/PAID ne sont PAS écrasées (l'agent a déjà engagé, on ne revient
// pas dessus).
//
// Les lignes MANUAL sont intouchées.
// ============================================================================

import prisma from "@/lib/prisma";
import type { BudgetCategory, BudgetLineSource, Prisma } from "@prisma/client";
import { getFiscalYearRange, plannedMonthInFiscalYear, type FiscalYearRange } from "./fiscal-year";

interface ProposedLine {
  category: BudgetCategory;
  source: BudgetLineSource;
  sourceRefType: string;
  sourceRefId: string;
  label: string;
  vendor?: string | null;
  plannedMonth: number | null;
  plannedAmount: Prisma.Decimal | number;
  currency?: string;
  dueDate?: Date | null;
  notes?: string | null;
}

export interface IngestResult {
  createdCount: number;
  updatedCount: number;
  skippedLockedCount: number;
  proposed: ProposedLine[];
}

// Lignes qui, une fois engagées, ne sont plus écrasées par l'ingestion.
const LOCKED_STATUSES = ["COMMITTED", "INVOICED", "PAID"] as const;

export async function ingestBudget(budgetId: string, options: { dryRun?: boolean } = {}): Promise<IngestResult> {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { id: true, organizationId: true, fiscalYear: true, currency: true },
  });
  if (!budget) throw new Error("Budget introuvable");

  const range = await getFiscalYearRange(budget.organizationId, budget.fiscalYear);
  const proposed = await collectProposedLines(budget.organizationId, range);

  if (options.dryRun) {
    return { createdCount: 0, updatedCount: 0, skippedLockedCount: 0, proposed };
  }

  let createdCount = 0;
  let updatedCount = 0;
  let skippedLockedCount = 0;

  for (const p of proposed) {
    const existing = await prisma.budgetLine.findFirst({
      where: {
        budgetId: budget.id,
        source: p.source,
        sourceRefType: p.sourceRefType,
        sourceRefId: p.sourceRefId,
      },
      select: { id: true, status: true },
    });

    if (existing) {
      if ((LOCKED_STATUSES as readonly string[]).includes(existing.status)) {
        skippedLockedCount++;
        continue;
      }
      await prisma.budgetLine.update({
        where: { id: existing.id },
        data: {
          category: p.category,
          label: p.label,
          vendor: p.vendor ?? null,
          plannedMonth: p.plannedMonth,
          plannedAmount: p.plannedAmount as unknown as Prisma.Decimal,
          currency: p.currency ?? budget.currency,
          dueDate: p.dueDate ?? null,
          notes: p.notes ?? null,
        },
      });
      updatedCount++;
    } else {
      await prisma.budgetLine.create({
        data: {
          budgetId: budget.id,
          category: p.category,
          source: p.source,
          sourceRefType: p.sourceRefType,
          sourceRefId: p.sourceRefId,
          label: p.label,
          vendor: p.vendor ?? null,
          plannedMonth: p.plannedMonth,
          plannedAmount: p.plannedAmount as unknown as Prisma.Decimal,
          currency: p.currency ?? budget.currency,
          dueDate: p.dueDate ?? null,
          notes: p.notes ?? null,
        },
      });
      createdCount++;
    }
  }

  return { createdCount, updatedCount, skippedLockedCount, proposed };
}

// ----------------------------------------------------------------------------
// Collecte par source. Chacune retourne des lignes avec un montant estimé.
// ----------------------------------------------------------------------------

async function collectProposedLines(orgId: string, range: FiscalYearRange): Promise<ProposedLine[]> {
  const [subs, licenses, warranties, support, contracts] = await Promise.all([
    collectSubscriptions(orgId, range),
    collectLicenses(orgId, range),
    collectWarranties(orgId, range),
    collectSupport(orgId, range),
    collectContracts(orgId, range),
  ]);
  return [...subs, ...licenses, ...warranties, ...support, ...contracts];
}

async function collectSubscriptions(orgId: string, range: FiscalYearRange): Promise<ProposedLine[]> {
  // Abonnements : soit l'endDate tombe dans le FY (renouvellement à prévoir),
  // soit autoRenew + cycle récurrent qui génère des paiements dans le FY.
  const items = await prisma.assetSubscription.findMany({
    where: {
      organizationId: orgId,
      OR: [
        { endDate: { gte: range.start, lt: range.end } },
        { autoRenew: true, endDate: { lt: range.end } },
      ],
    },
    include: { asset: { select: { name: true } } },
  });
  const out: ProposedLine[] = [];
  for (const s of items) {
    const label = `${s.vendor ?? s.plan ?? "Abonnement"}${s.asset ? ` — ${s.asset.name}` : ""}`;
    const amount = (s as unknown as { amount?: number | null }).amount ?? 0;
    const due = s.endDate;
    const month = plannedMonthInFiscalYear(due, range);
    out.push({
      category: "SUBSCRIPTIONS",
      source: "AUTO_SUBSCRIPTION",
      sourceRefType: "asset_subscription",
      sourceRefId: s.id,
      label,
      vendor: s.vendor,
      plannedMonth: month,
      plannedAmount: amount,
      currency: s.currency,
      dueDate: due,
      notes: s.autoRenew ? "Renouvellement automatique" : null,
    });
  }
  return out;
}

async function collectLicenses(orgId: string, range: FiscalYearRange): Promise<ProposedLine[]> {
  const items = await prisma.softwareLicense.findMany({
    where: {
      organizationId: orgId,
      endDate: { gte: range.start, lt: range.end },
    },
    include: {
      instance: { select: { name: true, vendor: true } },
      template: { select: { name: true, vendor: true } },
    },
  });
  return items.map((l) => {
    const name = l.instance?.name ?? l.template?.name ?? "Licence";
    const vendor = l.instance?.vendor ?? l.template?.vendor ?? null;
    const due = l.endDate!;
    return {
      category: "LICENSES" as BudgetCategory,
      source: "AUTO_LICENSE" as BudgetLineSource,
      sourceRefType: "software_license",
      sourceRefId: l.id,
      label: `${name}${l.seats ? ` (${l.seats} sièges)` : ""}`,
      vendor,
      plannedMonth: plannedMonthInFiscalYear(due, range),
      plannedAmount: 0, // montant inconnu sur SoftwareLicense — à compléter par Cetix
      dueDate: due,
      notes: "Montant à estimer (pas de prix unitaire sur la licence)",
    };
  });
}

async function collectWarranties(orgId: string, range: FiscalYearRange): Promise<ProposedLine[]> {
  const items = await prisma.assetWarranty.findMany({
    where: {
      organizationId: orgId,
      endDate: { gte: range.start, lt: range.end },
    },
    include: { asset: { select: { name: true } } },
  });
  return items.map((w) => ({
    category: "WARRANTIES" as BudgetCategory,
    source: "AUTO_WARRANTY" as BudgetLineSource,
    sourceRefType: "asset_warranty",
    sourceRefId: w.id,
    label: `Garantie ${w.vendor ?? ""} — ${w.asset.name}`.trim(),
    vendor: w.vendor,
    plannedMonth: plannedMonthInFiscalYear(w.endDate, range),
    plannedAmount: 0, // coût renouvellement non stocké
    dueDate: w.endDate,
    notes: `Niveau: ${w.coverageLevel}. Coût à estimer.`,
  }));
}

async function collectSupport(orgId: string, range: FiscalYearRange): Promise<ProposedLine[]> {
  const items = await prisma.assetSupportContract.findMany({
    where: {
      organizationId: orgId,
      endDate: { gte: range.start, lt: range.end },
    },
    include: { asset: { select: { name: true } } },
  });
  return items.map((c) => ({
    category: "SUPPORT" as BudgetCategory,
    source: "AUTO_SUPPORT" as BudgetLineSource,
    sourceRefType: "asset_support_contract",
    sourceRefId: c.id,
    label: `Support ${c.vendor ?? ""} (${c.tier}) — ${c.asset.name}`.trim(),
    vendor: c.vendor,
    plannedMonth: plannedMonthInFiscalYear(c.endDate, range),
    plannedAmount: 0,
    dueDate: c.endDate,
    notes: `Niveau ${c.tier}. Coût à estimer.`,
  }));
}

async function collectContracts(orgId: string, range: FiscalYearRange): Promise<ProposedLine[]> {
  // Contrats actifs pendant au moins une partie du FY (endDate null ou > start).
  const items = await prisma.contract.findMany({
    where: {
      organizationId: orgId,
      status: "ACTIVE",
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
  });
  const out: ProposedLine[] = [];
  for (const c of items) {
    // Estimation annuelle : monthlyHours * hourlyRate * 12. Si inconnu, 0.
    let annual = 0;
    if (c.monthlyHours != null && c.hourlyRate != null) {
      annual = c.monthlyHours * c.hourlyRate * 12;
    }
    out.push({
      category: c.type === "SUPPORT" ? "SUPPORT" : "EXTERNAL_SERVICES",
      source: "AUTO_CONTRACT",
      sourceRefType: "contract",
      sourceRefId: c.id,
      label: `Contrat ${c.name}`,
      plannedMonth: null, // réparti sur l'année
      plannedAmount: annual,
      dueDate: c.endDate,
      notes: c.monthlyHours ? `${c.monthlyHours}h/mois × ${c.hourlyRate}$/h` : null,
    });
  }
  return out;
}
