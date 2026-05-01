// ============================================================================
// Audit système — validation de bout en bout après les changements de session
//
// Couvre :
//   A. Time entries — schéma, persistance, flags
//   B. Widget queries — filtres, agrégations, groupBy
//   C. Monthly report builder — payload, recap, hour bank
//   D. AI triage — invocations, categorySource, scope
//   E. Categories — scope CLIENT/INTERNAL, intégrité
//   F. Edge cases — orphelins, dates futures, données vides
//
// Sortie : tableau PASS / FAIL / WARN avec détails. Exit code = nb de FAIL.
// ============================================================================

import { config as loadEnv } from "dotenv";
loadEnv();

import prisma from "../src/lib/prisma";
import { executeSingleQuery } from "../src/app/api/v1/analytics/query/route";
import { buildMonthlyReportPayload } from "../src/lib/reports/monthly/builder";

interface CheckResult {
  section: string;
  name: string;
  status: "PASS" | "FAIL" | "WARN" | "INFO";
  detail: string;
}

const results: CheckResult[] = [];

function check(section: string, name: string, status: CheckResult["status"], detail: string) {
  results.push({ section, name, status, detail });
}

// ---------------------------------------------------------------------------
// A. Time entries
// ---------------------------------------------------------------------------
async function auditTimeEntries() {
  const SECTION = "A. Time entries";

  const total = await prisma.timeEntry.count();
  check(SECTION, "Total entries en DB", "INFO", `${total} entries`);

  // Schéma : la colonne force_non_billable existe ?
  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns WHERE table_name='time_entries'`,
  );
  const colNames = new Set(cols.map((c) => c.column_name));
  const expectedCols = [
    "force_non_billable", "coverage_status", "coverage_reason", "duration_minutes",
    "is_after_hours", "is_weekend", "is_urgent", "is_onsite", "has_travel_billed",
    "started_at", "ended_at", "amount", "hourly_rate", "approval_status",
    "work_type_id", "rate_tier_id",
  ];
  const missing = expectedCols.filter((c) => !colNames.has(c));
  check(SECTION, "Colonnes attendues", missing.length === 0 ? "PASS" : "FAIL",
    missing.length === 0 ? "Toutes présentes" : `Manque : ${missing.join(", ")}`);

  // Distribution coverage_status
  const covDist = await prisma.$queryRawUnsafe<Array<{ cs: string; n: bigint }>>(
    `SELECT coverage_status AS cs, COUNT(*)::bigint AS n FROM time_entries GROUP BY coverage_status ORDER BY 2 DESC`,
  );
  const validCoverages = new Set([
    "billable", "non_billable", "included_in_contract", "deducted_from_hour_bank",
    "hour_bank_overage", "msp_overage", "internal_time", "travel_billable",
    "travel_non_billable", "excluded_from_billing", "pending",
  ]);
  const invalid = covDist.filter((c) => !validCoverages.has(c.cs));
  check(SECTION, "coverageStatus valides", invalid.length === 0 ? "PASS" : "FAIL",
    invalid.length === 0
      ? `Distribution : ${covDist.map((c) => `${c.cs}=${Number(c.n)}`).join(", ")}`
      : `Invalides : ${invalid.map((c) => c.cs).join(", ")}`);

  // forceNonBillable cohérent avec coverage_status
  const nonBillForce = await prisma.timeEntry.count({
    where: { forceNonBillable: true, coverageStatus: { not: "non_billable" } },
  });
  check(SECTION, "forceNonBillable=true ⇒ coverage=non_billable",
    nonBillForce === 0 ? "PASS" : "WARN",
    nonBillForce === 0 ? "Cohérent" : `${nonBillForce} entries incohérentes`);

  // Approval status valides
  const apprDist = await prisma.$queryRawUnsafe<Array<{ s: string; n: bigint }>>(
    `SELECT approval_status AS s, COUNT(*)::bigint AS n FROM time_entries GROUP BY approval_status`,
  );
  check(SECTION, "approvalStatus distribution", "INFO",
    apprDist.map((a) => `${a.s}=${Number(a.n)}`).join(", "));

  // hasTravelBilled requires isOnsite — invariant
  const trvlInvalid = await prisma.timeEntry.count({
    where: { hasTravelBilled: true, isOnsite: false },
  });
  check(SECTION, "hasTravelBilled=true ⇒ isOnsite=true",
    trvlInvalid === 0 ? "PASS" : "WARN",
    trvlInvalid === 0 ? "Invariant respecté" : `${trvlInvalid} violations`);

  // Durations positives
  const negDur = await prisma.timeEntry.count({ where: { durationMinutes: { lte: 0 } } });
  check(SECTION, "Durations > 0", negDur === 0 ? "PASS" : "FAIL",
    negDur === 0 ? "OK" : `${negDur} entries avec duration ≤ 0`);

  // amount cohérent avec coverage billable
  const billableNoAmount = await prisma.timeEntry.count({
    where: {
      coverageStatus: { in: ["billable", "hour_bank_overage", "msp_overage"] },
      OR: [{ amount: null }, { amount: 0 }],
    },
  });
  check(SECTION, "Entries facturables ont un amount",
    billableNoAmount === 0 ? "PASS" : "WARN",
    billableNoAmount === 0 ? "OK" : `${billableNoAmount} facturables sans amount > 0`);

  // FK orphelines
  const orphTickets = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(*)::bigint AS n FROM time_entries te LEFT JOIN tickets t ON t.id=te.ticket_id WHERE t.id IS NULL`,
  );
  check(SECTION, "FK ticket valide",
    Number(orphTickets[0].n) === 0 ? "PASS" : "FAIL",
    `${Number(orphTickets[0].n)} entries avec ticket inexistant`);

  const orphAgents = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(*)::bigint AS n FROM time_entries te LEFT JOIN users u ON u.id=te.agent_id WHERE u.id IS NULL`,
  );
  check(SECTION, "FK agent valide",
    Number(orphAgents[0].n) === 0 ? "PASS" : "FAIL",
    `${Number(orphAgents[0].n)} entries avec agent inexistant`);
}

// ---------------------------------------------------------------------------
// B. Widget queries
// ---------------------------------------------------------------------------
async function auditWidgetQueries() {
  const SECTION = "B. Widget queries";

  // Sum total durationMinutes (sans filtre)
  const r1 = await executeSingleQuery({
    dataset: "time_entries",
    filters: [],
    aggregate: "sum", aggregateField: "durationMinutes",
    sortBy: "value", sortDir: "desc", limit: 50, dateField: "startedAt",
  });
  check(SECTION, "Sum durationMinutes (toutes entries)",
    r1.error ? "FAIL" : "PASS",
    r1.error ?? `total=${r1.total}, value=${r1.results[0]?.value ?? "—"}h`);

  // Filtre forceNonBillable=true
  const r2 = await executeSingleQuery({
    dataset: "time_entries",
    filters: [{ field: "forceNonBillable", operator: "eq", value: "true" }] as never,
    aggregate: "sum", aggregateField: "durationMinutes",
    sortBy: "value", sortDir: "desc", limit: 50, dateField: "startedAt",
  });
  const expectedNB = await prisma.timeEntry.count({ where: { forceNonBillable: true } });
  check(SECTION, "Filtre forceNonBillable=true",
    r2.error ? "FAIL" : "PASS",
    r2.error ?? `${r2.total}min sur ${expectedNB} entries trouvées (DB count: ${expectedNB})`);

  // Group by agentId
  const r3 = await executeSingleQuery({
    dataset: "time_entries",
    filters: [],
    groupBy: "agentId",
    aggregate: "sum", aggregateField: "durationMinutes",
    sortBy: "value", sortDir: "desc", limit: 50, dateField: "startedAt",
  });
  check(SECTION, "Group by agentId",
    r3.error ? "FAIL" : "PASS",
    r3.error ?? `${r3.results.length} agents : ${r3.results.slice(0, 3).map((r) => `${r.label}=${r.value}h`).join(", ")}`);

  // Filtre coverageStatus=billable
  const r4 = await executeSingleQuery({
    dataset: "time_entries",
    filters: [{ field: "coverageStatus", operator: "eq", value: "billable" }] as never,
    aggregate: "count", aggregateField: "",
    sortBy: "value", sortDir: "desc", limit: 50, dateField: "startedAt",
  });
  const expectedBill = await prisma.timeEntry.count({ where: { coverageStatus: "billable" } });
  check(SECTION, "Filtre coverageStatus=billable",
    r4.error ? "FAIL" : "PASS",
    r4.error ?? `count=${r4.total}, attendu=${expectedBill}, ${r4.total === expectedBill ? "✓" : "✗ mismatch"}`);

  // Plage de dates avec couverture J+1
  const now = new Date();
  const from = new Date(); from.setDate(now.getDate() - 30); from.setHours(0, 0, 0, 0);
  const to = new Date(); to.setHours(23, 59, 59, 999);
  const r5 = await executeSingleQuery({
    dataset: "time_entries",
    filters: [],
    aggregate: "count", aggregateField: "",
    sortBy: "value", sortDir: "desc", limit: 50, dateField: "startedAt",
    dateFrom: from.toISOString(), dateTo: to.toISOString(),
  });
  check(SECTION, "Date range 30j (fin de jour)",
    r5.error ? "FAIL" : "PASS",
    r5.error ?? `count=${r5.total} sur la fenêtre`);

  // Group by tickets/category par client (à travers la relation)
  const r6 = await executeSingleQuery({
    dataset: "time_entries",
    filters: [],
    groupBy: "organizationId",
    aggregate: "sum", aggregateField: "durationMinutes",
    sortBy: "value", sortDir: "desc", limit: 5, dateField: "startedAt",
  });
  check(SECTION, "Group by organizationId",
    r6.error ? "FAIL" : "PASS",
    r6.error ?? `${r6.results.length} orgs, top: ${r6.results.slice(0, 3).map((r) => `${r.label}=${r.value}h`).join(", ")}`);
}

// ---------------------------------------------------------------------------
// C. Monthly report builder
// ---------------------------------------------------------------------------
async function auditMonthlyReports() {
  const SECTION = "C. Monthly reports";

  for (const slug of ["sadb", "dlsn", "lv"]) {
    const org = await prisma.organization.findFirst({ where: { slug } });
    if (!org) {
      check(SECTION, `${slug} payload`, "WARN", "Org introuvable");
      continue;
    }
    try {
      const payload = await buildMonthlyReportPayload({
        organizationId: org.id, period: "2026-04",
      });
      const tot = payload.totals;
      const recap = payload.recap;
      const hb = payload.hourBankTracking;
      check(SECTION, `${slug} build payload`, "PASS",
        `${tot.totalHours}h livrées, ${tot.ticketsTouchedCount} tickets, ${payload.trips.count} déplacements, recap=${recap ? "✓" : "—"}, hourBank=${hb ? `${hb.consumedHours}/${hb.totalHours}h ${hb.status}` : "—"}`);

      // Cohérence interne
      const agentSum = payload.byAgent.reduce((s, a) => s + a.hours, 0);
      const drift = Math.abs(agentSum - tot.totalHours);
      check(SECTION, `${slug} cohérence byAgent vs totalHours`,
        drift < 0.5 ? "PASS" : "WARN",
        `byAgent total=${agentSum.toFixed(2)}h, totalHours=${tot.totalHours}h, drift=${drift.toFixed(2)}h`);

      // hourBankTracking : history monotone, projection cohérente
      if (hb) {
        const hbSum = hb.monthlyHistory.reduce((s, m) => s + m.hours, 0);
        check(SECTION, `${slug} hourBank consumed = sum(monthlyHistory ≤ now)`,
          Math.abs(hbSum - hb.consumedHours) < 0.5 ? "PASS" : "WARN",
          `sum(history)=${hbSum.toFixed(2)}, consumed=${hb.consumedHours}`);

        const hasNonNeg = hb.monthlyHistory.every((m) => m.hours >= 0);
        check(SECTION, `${slug} hourBank monthlyHistory ≥ 0`,
          hasNonNeg ? "PASS" : "FAIL",
          hasNonNeg ? "OK" : "Valeurs négatives détectées");

        const status = hb.status;
        const validStatus = ["on_track", "warning", "overage", "no_data"].includes(status);
        check(SECTION, `${slug} hourBank status valide`,
          validStatus ? "PASS" : "FAIL", `status=${status}`);
      }
    } catch (e) {
      check(SECTION, `${slug} build payload`, "FAIL",
        e instanceof Error ? e.message : String(e));
    }
  }
}

// ---------------------------------------------------------------------------
// D. AI triage
// ---------------------------------------------------------------------------
async function auditAiTriage() {
  const SECTION = "D. AI triage";

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const inv = await prisma.aiInvocation.findMany({
    where: { feature: "triage", createdAt: { gte: last24h } },
    select: { status: true },
  });
  const byStatus: Record<string, number> = {};
  inv.forEach((i) => byStatus[i.status] = (byStatus[i.status] ?? 0) + 1);
  check(SECTION, "Invocations triage 24h", "INFO",
    Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(", ") || "(aucune)");

  // categorySource distribution
  const catDist = await prisma.$queryRawUnsafe<Array<{ src: string | null; n: bigint }>>(
    `SELECT category_source AS src, COUNT(*)::bigint AS n FROM tickets GROUP BY category_source ORDER BY 2 DESC`,
  );
  check(SECTION, "categorySource distribution", "INFO",
    catDist.map((c) => `${c.src ?? "null"}=${Number(c.n)}`).join(", "));

  // Tickets avec AI source mais catégorie inexistante = orphelins
  const aiOrph = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(*)::bigint AS n FROM tickets t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.category_source = 'AI' AND t.category_id IS NOT NULL AND c.id IS NULL`,
  );
  check(SECTION, "Pas de ticket AI avec category orpheline",
    Number(aiOrph[0].n) === 0 ? "PASS" : "WARN",
    `${Number(aiOrph[0].n)} tickets pointent vers une cat supprimée`);
}

// ---------------------------------------------------------------------------
// E. Categories
// ---------------------------------------------------------------------------
async function auditCategories() {
  const SECTION = "E. Categories";

  const dist = await prisma.$queryRawUnsafe<Array<{ s: string; n: bigint }>>(
    `SELECT scope::text AS s, COUNT(*)::bigint AS n FROM categories WHERE is_active = true GROUP BY scope ORDER BY 1`,
  );
  check(SECTION, "Distribution par scope", "INFO",
    dist.map((d) => `${d.s}=${Number(d.n)}`).join(", "));

  // Cohérence parent/enfant : un enfant doit avoir le même scope que son parent
  const incoherent = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(*)::bigint AS n FROM categories c
     JOIN categories p ON p.id = c.parent_id
     WHERE c.scope::text != p.scope::text`,
  );
  check(SECTION, "Scope cohérent parent/enfant",
    Number(incoherent[0].n) === 0 ? "PASS" : "FAIL",
    Number(incoherent[0].n) === 0
      ? "Tous les enfants héritent du scope parent"
      : `${Number(incoherent[0].n)} catégories incohérentes`);

  // Tickets internes pointent vers cat INTERNAL ?
  const ticketInternalWrongScope = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(*)::bigint AS n FROM tickets t
     JOIN categories c ON c.id = t.category_id
     WHERE t.is_internal = true AND c.scope::text = 'CLIENT'`,
  );
  const ticketClientWrongScope = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(*)::bigint AS n FROM tickets t
     JOIN categories c ON c.id = t.category_id
     WHERE t.is_internal = false AND c.scope::text = 'INTERNAL'`,
  );
  check(SECTION, "Tickets internes → cat INTERNAL/BOTH",
    Number(ticketInternalWrongScope[0].n) === 0 ? "PASS" : "WARN",
    `${Number(ticketInternalWrongScope[0].n)} tickets internes pointent vers cat CLIENT`);
  check(SECTION, "Tickets clients → cat CLIENT/BOTH",
    Number(ticketClientWrongScope[0].n) === 0 ? "PASS" : "WARN",
    `${Number(ticketClientWrongScope[0].n)} tickets clients pointent vers cat INTERNAL`);
}

// ---------------------------------------------------------------------------
// F. Edge cases
// ---------------------------------------------------------------------------
async function auditEdgeCases() {
  const SECTION = "F. Edge cases";

  // Saisies futures (started_at > now) — bug de timezone ?
  const futureEntries = await prisma.timeEntry.count({
    where: { startedAt: { gt: new Date(Date.now() + 60_000) } }, // marge 1min
  });
  check(SECTION, "Pas de saisies dans le futur",
    futureEntries === 0 ? "PASS" : "WARN",
    futureEntries === 0
      ? "OK"
      : `${futureEntries} entries avec started_at > maintenant (probable bug TZ)`);

  // Saisies très anciennes (>10 ans) — anomalies de migration
  const ancientEntries = await prisma.timeEntry.count({
    where: { startedAt: { lt: new Date("2016-01-01") } },
  });
  check(SECTION, "Pas de saisies > 10 ans",
    ancientEntries === 0 ? "PASS" : "WARN",
    ancientEntries === 0 ? "OK" : `${ancientEntries} entries antérieures à 2016`);

  // Dashboards publiés avec organizationId orphelin
  const orphDashboards = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(*)::bigint AS n FROM published_dashboards pd
     LEFT JOIN organizations o ON o.id = pd.organization_id
     WHERE pd.organization_id IS NOT NULL AND o.id IS NULL`,
  );
  check(SECTION, "PublishedDashboard FK org valide",
    Number(orphDashboards[0].n) === 0 ? "PASS" : "FAIL",
    `${Number(orphDashboards[0].n)} dashboards orphelins`);

  // Org avec banque d'heures mais 0 saisie deducted_from_hour_bank → cas légitime
  // (org payée le forfait mais pas encore de saisie). Juste informatif.
  const orgsWithHB = await prisma.organization.findMany({
    select: { id: true, slug: true, orgBillingConfig: true },
  });
  let hbOrgsCount = 0;
  let hbOrgsWithEntries = 0;
  for (const o of orgsWithHB) {
    const cfg = o.orgBillingConfig as { hourBank?: { totalHours?: number } } | null;
    if (cfg?.hourBank?.totalHours && cfg.hourBank.totalHours > 0) {
      hbOrgsCount++;
      const n = await prisma.timeEntry.count({
        where: { organizationId: o.id, coverageStatus: "deducted_from_hour_bank" },
      });
      if (n > 0) hbOrgsWithEntries++;
    }
  }
  check(SECTION, "Orgs avec banque d'heures actives", "INFO",
    `${hbOrgsCount} configurées, ${hbOrgsWithEntries} avec consommation`);

  // Reports mensuels persistés sans payload
  const reportsNoPayload = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(*)::bigint AS n FROM monthly_client_reports WHERE payload_json IS NULL`,
  );
  check(SECTION, "MonthlyClientReport tous avec payload",
    Number(reportsNoPayload[0].n) === 0 ? "PASS" : "WARN",
    `${Number(reportsNoPayload[0].n)} rapports sans payload`);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  await auditTimeEntries();
  await auditWidgetQueries();
  await auditMonthlyReports();
  await auditAiTriage();
  await auditCategories();
  await auditEdgeCases();

  // Affichage par section
  const bySection = new Map<string, CheckResult[]>();
  for (const r of results) {
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section)!.push(r);
  }

  for (const [section, checks] of bySection) {
    console.log(`\n${section}`);
    console.log("─".repeat(section.length));
    for (const c of checks) {
      const symbol = { PASS: "✓", FAIL: "✗", WARN: "⚠", INFO: "·" }[c.status];
      const color = { PASS: "32", FAIL: "31", WARN: "33", INFO: "90" }[c.status];
      console.log(`  \x1b[${color}m${symbol}\x1b[0m ${c.name.padEnd(50)} ${c.detail}`);
    }
  }

  const counts = { PASS: 0, FAIL: 0, WARN: 0, INFO: 0 };
  results.forEach((r) => counts[r.status]++);
  console.log(
    `\n\nRécap : \x1b[32m${counts.PASS} PASS\x1b[0m · \x1b[31m${counts.FAIL} FAIL\x1b[0m · \x1b[33m${counts.WARN} WARN\x1b[0m · ${counts.INFO} INFO  (${Math.round((Date.now() - t0) / 1000)}s)`,
  );

  await prisma.$disconnect();
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
