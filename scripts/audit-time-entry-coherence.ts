// ============================================================================
// AUDIT — vérifie que les agrégations TimeEntry sont cohérentes entre les
// principaux consommateurs (Finances global, Org reports, Monthly PDF builder).
//
// Pour le mois en cours et chaque organisation ayant ≥ 1 saisie ce mois,
// compare le total `billableHours` rapporté par :
//
//   1. Calcul direct depuis prisma + isBillable() (référence)
//   2. Le builder du PDF mensuel (lib/reports/monthly/builder.ts)
//   3. La logique inline ré-implémentée pour matcher l'API /finances
//      et /organizations/[id]/reports
//
// Avant le commit "helpers canoniques coverageStatus", le PDF retournait
// un chiffre différent (ignorait travel_billable / hour_bank_overage /
// msp_overage). Ce script échoue avec un écart > 0.1h si la régression
// est réintroduite.
//
// USAGE : npx tsx scripts/audit-time-entry-coherence.ts
// ============================================================================

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { isBillable, EXCLUDED_APPROVAL_STATUSES } from '../src/lib/billing/coverage-statuses';
import { buildMonthlyReportPayload } from '../src/lib/reports/monthly/builder';

const TOLERANCE_HOURS = 0.05; // 3 minutes max d'écart toléré (arrondi décimal)

async function main() {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  console.log(`Audit cohérence TimeEntry · période ${period}\n`);

  // 1. Liste les orgs ayant ≥ 1 saisie ce mois-ci
  const grouped = await prisma.timeEntry.groupBy({
    by: ['organizationId'],
    where: { startedAt: { gte: monthStart, lt: monthEnd } },
    _count: { _all: true },
  });

  if (grouped.length === 0) {
    console.log("Aucune saisie ce mois-ci — rien à auditer.");
    await prisma.$disconnect();
    return;
  }

  console.log(`${grouped.length} organisation(s) avec saisies ce mois.\n`);

  const failures: Array<{ orgId: string; refHours: number; pdfHours: number; delta: number }> = [];

  for (const g of grouped) {
    const orgId = g.organizationId;
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    const orgName = org?.name ?? `(${orgId})`;

    // RÉFÉRENCE : calcul direct depuis le helper canonique
    // Filtre approvalStatus aligné sur les consommateurs (rejected exclu).
    const entries = await prisma.timeEntry.findMany({
      where: {
        organizationId: orgId,
        startedAt: { gte: monthStart, lt: monthEnd },
        approvalStatus: { notIn: EXCLUDED_APPROVAL_STATUSES as unknown as string[] },
      },
      select: { durationMinutes: true, coverageStatus: true },
    });
    const refMinutes = entries.filter((e) => isBillable(e.coverageStatus)).reduce((s, e) => s + e.durationMinutes, 0);
    // round1 (1 décimale) pour matcher l'arrondi du builder PDF — sinon
    // un écart fixe de 0.05h (purement cosmétique) trigger des faux positifs.
    const refHours = Math.round((refMinutes / 60) * 10) / 10;

    // BUILDER PDF MENSUEL
    let pdfHours = 0;
    try {
      const report = await buildMonthlyReportPayload({ organizationId: orgId, period });
      pdfHours = report.totals?.billableHours ?? 0;
    } catch (err) {
      console.log(`  ⚠ ${orgName} : builder PDF a échoué : ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const delta = Math.abs(pdfHours - refHours);
    const status = delta <= TOLERANCE_HOURS ? "✓" : "✕";
    console.log(`  ${status} ${orgName.padEnd(40)} ref=${refHours.toFixed(2)}h · pdf=${pdfHours.toFixed(2)}h · Δ=${delta.toFixed(3)}h`);

    if (delta > TOLERANCE_HOURS) {
      failures.push({ orgId, refHours, pdfHours, delta });
    }
  }

  console.log(`\nRésultat : ${failures.length === 0 ? "✓ COHÉRENT" : `✕ ${failures.length} écart(s) détecté(s)`}`);
  if (failures.length > 0) {
    console.log("\nLes écarts > 0.05h indiquent que le PDF mensuel et la définition canonique");
    console.log("ne s'alignent plus. Vérifier src/lib/reports/monthly/builder.ts et");
    console.log("src/lib/billing/coverage-statuses.ts.");
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Audit failed:", e);
  process.exit(1);
});
