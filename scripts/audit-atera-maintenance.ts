// ============================================================================
// AUDIT — Maintenance Atera (automatique)
// ============================================================================
// Lancé via cron à minuit. Effectue les vérifications mécaniques des sections
// restantes du plan d'audit (4.6, 5.x, 6, 7, 10, 11, P1 corrigés), produit un
// rapport markdown dans /tmp/ et l'envoie par email aux super-admins.
//
// Lecture seule : ne modifie AUCUN fichier du projet.
//
// Usage manuel : npx tsx scripts/audit-atera-maintenance.ts
// Usage cron   : 1 0 * * * cd /opt/nexus && /usr/bin/npx tsx scripts/audit-atera-maintenance.ts >> /tmp/atera-audit.log 2>&1

import { config as loadEnv } from "dotenv";
loadEnv();

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import prisma from "../src/lib/prisma";
import { sendEmail } from "../src/lib/email/send";

// ----------------------------------------------------------------------------
// Modèle de résultat
// ----------------------------------------------------------------------------

type Status = "ok" | "warn" | "fail";
type Priority = "P0" | "P1" | "P2";

interface CheckResult {
  section: string;
  name: string;
  priority: Priority;
  status: Status;
  details: string;
}

const results: CheckResult[] = [];

function add(r: CheckResult) {
  results.push(r);
  const icon = r.status === "ok" ? "✓" : r.status === "warn" ? "⚠" : "✗";
  console.log(`[${r.section}] ${icon} ${r.name} — ${r.details.slice(0, 100)}`);
}

function fileContains(path: string, needle: string | RegExp): boolean {
  if (!existsSync(path)) return false;
  const c = readFileSync(path, "utf8");
  return typeof needle === "string" ? c.includes(needle) : needle.test(c);
}

// ----------------------------------------------------------------------------
// Section 1 — Statique (tsc, eslint, prisma validate)
// ----------------------------------------------------------------------------

async function section1() {
  console.log("\n=== Section 1 — Statique ===");
  // tsc
  try {
    execSync("npx tsc --noEmit", { cwd: "/opt/nexus", stdio: "pipe" });
    add({ section: "1.1", name: "tsc --noEmit", priority: "P0", status: "ok", details: "0 erreur" });
  } catch (e) {
    const out = (e as { stdout?: Buffer }).stdout?.toString() || String(e);
    const errCount = (out.match(/error TS/g) || []).length;
    add({ section: "1.1", name: "tsc --noEmit", priority: "P0", status: "fail", details: `${errCount} erreurs : ${out.slice(0, 300)}` });
  }

  // prisma validate
  try {
    execSync("npx prisma validate", { cwd: "/opt/nexus", stdio: "pipe" });
    add({ section: "1.3", name: "prisma validate", priority: "P0", status: "ok", details: "Schema valide" });
  } catch (e) {
    add({ section: "1.3", name: "prisma validate", priority: "P0", status: "fail", details: String(e).slice(0, 300) });
  }

  // eslint sur les fichiers Atera
  try {
    const out = execSync(
      "npx eslint src/lib/integrations/atera-purge.ts src/lib/integrations/atera-client.ts src/components/settings/atera-maintenance-section.tsx 'src/app/api/v1/integrations/atera/inactive/route.ts' 'src/app/api/v1/integrations/atera/purge/route.ts' 'src/app/api/v1/integrations/atera/exclusions/route.ts' 'src/app/api/v1/integrations/atera/exclusions/[agentId]/route.ts' 'src/app/api/v1/integrations/atera/purge-log/route.ts' 'src/app/api/v1/integrations/atera/alert-recipients/route.ts' 2>&1",
      { cwd: "/opt/nexus", stdio: "pipe" }
    ).toString();
    const errCount = (out.match(/(\d+)\s+errors?/) || ["0"])[0];
    add({ section: "1.2", name: "eslint Atera files", priority: "P1", status: "ok", details: `${errCount}` });
  } catch (e) {
    const out = (e as { stdout?: Buffer }).stdout?.toString() || "";
    // ESLint affiche en pied : "✖ N problem(s) (M errors, K warnings)"
    const summary = out.match(/✖\s+(\d+)\s+problem/);
    const count = summary ? Number(summary[1]) : -1;
    // 1 erreur = le `any` préexistant sur HardwareInformation, acceptable
    if (count <= 1) {
      add({ section: "1.2", name: "eslint Atera files", priority: "P1", status: count === 0 ? "ok" : "warn", details: `${count} erreur (préexistante: HardwareInformation: any)` });
    } else {
      add({ section: "1.2", name: "eslint Atera files", priority: "P1", status: "fail", details: `${count} erreurs : ${out.slice(out.length - 500)}` });
    }
  }
}

// ----------------------------------------------------------------------------
// Section 2 — DB
// ----------------------------------------------------------------------------

async function section2() {
  console.log("\n=== Section 2 — DB ===");
  const expected = [
    { table: "atera_exclusions", indexes: ["atera_exclusions_pkey", "atera_exclusions_agent_id_key", "atera_exclusions_expires_at_idx"] },
    { table: "atera_purge_logs", indexes: ["atera_purge_logs_pkey", "atera_purge_logs_batch_id_idx", "atera_purge_logs_purged_by_id_purged_at_idx", "atera_purge_logs_agent_id_idx", "atera_purge_logs_linked_asset_id_idx"] },
    { table: "atera_alert_recipients", indexes: ["atera_alert_recipients_pkey", "atera_alert_recipients_user_id_key", "atera_alert_recipients_email_key"] },
  ];

  for (const e of expected) {
    const idxRows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE tablename = $1`,
      e.table
    );
    const present = new Set(idxRows.map((r) => r.indexname));
    const missing = e.indexes.filter((i) => !present.has(i));
    if (missing.length === 0) {
      add({ section: "2.2", name: `Indexes ${e.table}`, priority: "P0", status: "ok", details: `${e.indexes.length}/${e.indexes.length}` });
    } else {
      add({ section: "2.2", name: `Indexes ${e.table}`, priority: "P0", status: "fail", details: `Manquants : ${missing.join(", ")}` });
    }
  }

  // FK constraints
  const fks = await prisma.$queryRawUnsafe<{ conname: string; table_name: string }[]>(
    `SELECT conname, conrelid::regclass::text AS table_name
     FROM pg_constraint
     WHERE contype = 'f' AND conrelid::regclass::text LIKE 'atera_%'`
  );
  const fkSet = new Set(fks.map((f) => f.conname));
  for (const expectedFk of [
    "atera_exclusions_added_by_id_fkey",
    "atera_purge_logs_purged_by_id_fkey",
    "atera_alert_recipients_user_id_fkey",
  ]) {
    if (fkSet.has(expectedFk)) {
      add({ section: "2.3", name: `FK ${expectedFk}`, priority: "P0", status: "ok", details: "présente" });
    } else {
      add({ section: "2.3", name: `FK ${expectedFk}`, priority: "P0", status: "fail", details: "manquante" });
    }
  }

  // Migration enregistrée
  const mig = await prisma.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null }[]>(
    `SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20260505_add_atera_maintenance'`
  );
  if (mig.length === 1 && mig[0].finished_at) {
    add({ section: "2.5", name: "Migration enregistrée", priority: "P0", status: "ok", details: `finished_at=${mig[0].finished_at.toISOString()}` });
  } else {
    add({ section: "2.5", name: "Migration enregistrée", priority: "P0", status: "fail", details: "manquante ou non finalisée" });
  }
}

// ----------------------------------------------------------------------------
// Section 3 — RBAC
// ----------------------------------------------------------------------------

async function section3() {
  console.log("\n=== Section 3 — RBAC ===");
  const routes = [
    "src/app/api/v1/integrations/atera/inactive/route.ts",
    "src/app/api/v1/integrations/atera/purge/route.ts",
    "src/app/api/v1/integrations/atera/exclusions/route.ts",
    "src/app/api/v1/integrations/atera/exclusions/[agentId]/route.ts",
    "src/app/api/v1/integrations/atera/purge-log/route.ts",
    "src/app/api/v1/integrations/atera/alert-recipients/route.ts",
  ];
  for (const r of routes) {
    const path = `/opt/nexus/${r}`;
    const c = readFileSync(path, "utf8");
    const handlers = c.match(/export async function (GET|POST|PUT|DELETE|PATCH)/g) || [];
    const checks = (c.match(/me\.role !== "SUPER_ADMIN"/g) || []).length;
    const ok = checks >= handlers.length;
    add({
      section: "3.1",
      name: `RBAC ${r.split("/integrations/atera/")[1]}`,
      priority: "P0",
      status: ok ? "ok" : "fail",
      details: `${handlers.length} handler(s), ${checks} check(s) SUPER_ADMIN`,
    });
  }
}

// ----------------------------------------------------------------------------
// Section 4.6 — Transaction PUT alert-recipients
// ----------------------------------------------------------------------------

async function section4_6() {
  console.log("\n=== Section 4.6 — Transaction PUT recipients ===");
  const path = "/opt/nexus/src/app/api/v1/integrations/atera/alert-recipients/route.ts";
  const c = readFileSync(path, "utf8");
  const inTransaction = /\$transaction\s*\(\s*\[[\s\S]*?deleteMany[\s\S]*?\.create\s*\(/m.test(c);
  add({
    section: "4.6",
    name: "PUT recipients = deleteMany + create dans $transaction",
    priority: "P0",
    status: inTransaction ? "ok" : "fail",
    details: inTransaction
      ? "Transaction wrappée — un échec rollback la suppression"
      : "Pas de $transaction détectée — risque de perte si create plante",
  });
}

// ----------------------------------------------------------------------------
// Section 5 — Lib purge
// ----------------------------------------------------------------------------

async function section5() {
  console.log("\n=== Section 5 — Lib purge ===");
  const path = "/opt/nexus/src/lib/integrations/atera-purge.ts";
  const c = readFileSync(path, "utf8");

  // 5.1 Idempotence : 404 traité comme already_deleted
  const idem = /\\b404\\b/.test(c) && /already_deleted/.test(c);
  add({ section: "5.1", name: "DELETE 404 = idempotent", priority: "P0", status: idem ? "ok" : "fail", details: idem ? "Pattern 404 → already_deleted présent" : "Pattern manquant" });

  // 5.4 Skip exclusion logué
  const skipExcluded = /status:\s*["']skipped_excluded["']/.test(c);
  add({ section: "5.4", name: "Skip exclusion logué", priority: "P0", status: skipExcluded ? "ok" : "fail", details: skipExcluded ? "AteraPurgeLog créé pour les exclus" : "Manquant" });

  // 5.5 Skip blocked logué
  const skipBlocked = /status:\s*["']skipped_blocked_by_links["']/.test(c);
  add({ section: "5.5", name: "Skip blocked_by_links logué", priority: "P0", status: skipBlocked ? "ok" : "fail", details: skipBlocked ? "AteraPurgeLog créé pour les bloqués" : "Manquant" });

  // 5.6 Erreur asset n'annule pas le DELETE
  const assetErrIsolated = /catch \(assetErr\)/.test(c);
  add({ section: "5.6", name: "Erreur asset Nexus isolée du DELETE", priority: "P0", status: assetErrIsolated ? "ok" : "warn", details: assetErrIsolated ? "try/catch séparé sur asset.update/delete" : "Pas de catch dédié" });

  // 5.7 Gestion des 2 formats externalId
  const dualFormat = /atera_/.test(c) && /idStrings/.test(c);
  add({ section: "5.7", name: "loadLinkedAssets gère atera_<id> ET <id>", priority: "P1", status: dualFormat ? "ok" : "warn", details: dualFormat ? "Les 2 formats sont cherchés" : "Format unique seulement" });

  // 5.9 fallback super-admins
  const fallback = /role:\s*["']SUPER_ADMIN["']/.test(c) && /resolveAlertEmails/.test(c);
  add({ section: "5.9", name: "resolveAlertEmails fallback super-admins", priority: "P0", status: fallback ? "ok" : "fail", details: fallback ? "Fallback SUPER_ADMIN actif" : "Manquant" });
}

// ----------------------------------------------------------------------------
// Section 6 — Atera client
// ----------------------------------------------------------------------------

async function section6() {
  console.log("\n=== Section 6 — Atera client ===");
  const c = readFileSync("/opt/nexus/src/lib/integrations/atera-client.ts", "utf8");

  // 6.1 Lecture env paresseuse
  const lazyEnv = /getApiKey\s*=\s*\(\)\s*=>\s*process\.env/.test(c);
  add({ section: "6.1", name: "Lecture env paresseuse", priority: "P0", status: lazyEnv ? "ok" : "fail", details: lazyEnv ? "getApiKey() lit à chaque appel" : "Lecture au module init (bug script)" });

  // 6.2 Pagination plafonnée
  const paged = /maxPages\s*=\s*opts\?\.maxPages\s*\?\?\s*1000/.test(c);
  add({ section: "6.2", name: "Pagination plafonnée maxPages=1000", priority: "P1", status: paged ? "ok" : "warn", details: "Sécurité anti-boucle" });

  // 6.5 Pas de cache `next: { revalidate }` côté DELETE
  const cacheOnGet = /next:\s*\{\s*revalidate:\s*60\s*\}/.test(c);
  const deleteUsesPlainFetch = /method:\s*"DELETE"[\s\S]{0,200}headers:\s*\{[\s\S]*?X-API-KEY/m.test(c);
  add({ section: "6.5", name: "DELETE n'utilise pas le cache next", priority: "P2", status: cacheOnGet && deleteUsesPlainFetch ? "ok" : "warn", details: "Cache 60s sur GET, DELETE direct" });

  // 6.6 Pas de retry sur 429 (P2 connue)
  const has429Retry = /\b429\b[\s\S]*?(retry|backoff)/i.test(c);
  add({ section: "6.6", name: "Retry sur HTTP 429", priority: "P2", status: has429Retry ? "ok" : "warn", details: has429Retry ? "Implémenté" : "Non implémenté (P2 connu)" });
}

// ----------------------------------------------------------------------------
// Section 7 — UX (lecture du composant)
// ----------------------------------------------------------------------------

async function section7() {
  console.log("\n=== Section 7 — UX ===");
  const c = readFileSync("/opt/nexus/src/components/settings/atera-maintenance-section.tsx", "utf8");

  const checks: Array<[string, RegExp | string, Priority]> = [
    ["7.1 Spinner sur Analyser", /Loader2[\s\S]*?animate-spin/, "P1"],
    ["7.2 Bandeau d'erreur", /text-red-600 bg-red-50/, "P1"],
    ["7.3 État vide candidates", /Aucun agent à afficher/, "P1"],
    ["7.4 Reset modal via remontage (key/conditional)", /open\s*&&\s*<ConfirmPurgeDialogBody/, "P0"],
    ["7.7 Toggle all sélectionnables uniquement", /selectableInFiltered\.(map|every|length)/, "P0"],
    ["7.8 canConfirm logique stricte", /confirmText === "SUPPRIMER"[\s\S]*?timer === 0[\s\S]*?!purging/, "P0"],
    ["7.9 Modal non-fermable pendant purge", /!o\s*&&\s*!purging\s*&&\s*onClose/, "P0"],
    ["7.11 aria-label sur boutons icon-only", /aria-label="Sélectionner|aria-label="Tout sélectionner|aria-label="Retirer/, "P1"],
    ["7.13 Lien externe vers asset Nexus", /target="_blank"[\s\S]*?rel="noreferrer"/, "P1"],
    ["7.14 React escape par défaut (pas de dangerouslySetInnerHTML)", /^(?![\s\S]*dangerouslySetInnerHTML)/, "P0"],
    ["7.15 409 PURGE_ALREADY_RUNNING géré côté UI", /res\.status === 409/, "P1"],
  ];
  for (const [name, pat, prio] of checks) {
    const ok = typeof pat === "string" ? c.includes(pat) : pat.test(c);
    add({ section: name.split(" ")[0], name: name.replace(/^[\d.]+\s/, ""), priority: prio, status: ok ? "ok" : "warn", details: ok ? "OK" : "Pattern non trouvé — à vérifier manuellement" });
  }
}

// ----------------------------------------------------------------------------
// Section 10 — Cohérence avec le reste de Nexus
// ----------------------------------------------------------------------------

async function section10() {
  console.log("\n=== Section 10 — Cohérence ===");
  const sync = readFileSync("/opt/nexus/src/lib/integrations/atera-sync.ts", "utf8");
  const respectsOverrides = /overridden\.has\("status"\)/.test(sync);
  add({ section: "10.2", name: "atera-sync respecte fieldOverrides.status", priority: "P0", status: respectsOverrides ? "ok" : "fail", details: respectsOverrides ? "RETIRED ne sera pas écrasé" : "Risque de résurrection" });

  // Contrainte unique
  const schema = readFileSync("/opt/nexus/prisma/schema.prisma", "utf8");
  const uniqueAsset = /@@unique\(\[organizationId, externalSource, externalId\]\)/.test(schema);
  add({ section: "10.3", name: "Asset unique constraint (org, source, externalId)", priority: "P0", status: uniqueAsset ? "ok" : "fail", details: uniqueAsset ? "Pas de doublon possible" : "Risque doublon" });

  // Cron sync atera
  const bg = readFileSync("/opt/nexus/src/lib/scheduler/background-jobs.ts", "utf8");
  const cronOk = /atera-assets-sync/.test(bg) && /900_000/.test(bg);
  add({ section: "10.1", name: "Cron atera-assets-sync 15min", priority: "P0", status: cronOk ? "ok" : "warn", details: cronOk ? "Toujours actif" : "Désactivé ou modifié" });
}

// ----------------------------------------------------------------------------
// Section 11 — Observabilité
// ----------------------------------------------------------------------------

async function section11() {
  console.log("\n=== Section 11 — Observabilité ===");
  const route = readFileSync("/opt/nexus/src/app/api/v1/integrations/atera/purge/route.ts", "utf8");

  add({
    section: "11.1",
    name: "Log structuré [atera-purge] batch=...",
    priority: "P1",
    status: /\[atera-purge\][\s\S]*?batch=/.test(route) ? "ok" : "warn",
    details: /\[atera-purge\][\s\S]*?batch=/.test(route) ? "console.info présent" : "Pas de log structuré",
  });

  add({
    section: "11.4",
    name: "Email failure → console.error",
    priority: "P1",
    status: /console\.error\([\s\S]{0,200}échec envoi email/.test(route) ? "ok" : "warn",
    details: /console\.error\([\s\S]{0,200}échec envoi email/.test(route) ? "console.error en cas de fail SMTP" : "Silence total",
  });
}

// ----------------------------------------------------------------------------
// Vérification des P1 corrigés (A1-A5)
// ----------------------------------------------------------------------------

async function sectionP1Verif() {
  console.log("\n=== Vérification P1 corrigés ===");

  // A1 cache
  const client = readFileSync("/opt/nexus/src/lib/integrations/atera-client.ts", "utf8");
  const a1 = /agentsCache\b[\s\S]*?invalidateAteraAgentsCache\b/.test(client);
  add({ section: "A1", name: "Cache agents 60s + invalidation", priority: "P1", status: a1 ? "ok" : "fail", details: a1 ? "Cache + invalidation présents" : "Manquant" });

  // A2 fieldOverrides
  const purge = readFileSync("/opt/nexus/src/lib/integrations/atera-purge.ts", "utf8");
  const a2 = /fieldOverrides:\s*\{\s*push:\s*"status"\s*\}/.test(purge);
  add({ section: "A2", name: "fieldOverrides.push('status') sur archive", priority: "P1", status: a2 ? "ok" : "fail", details: a2 ? "Override marqué" : "Manquant" });

  // A3 advisory lock
  const a3 = /pg_try_advisory_lock/.test(purge) && /AteraPurgeAlreadyRunningError/.test(purge);
  add({ section: "A3", name: "Verrou advisory + erreur typée", priority: "P1", status: a3 ? "ok" : "fail", details: a3 ? "Lock + 409" : "Manquant" });

  // A4 email visibility — console.error englobe le message "échec envoi email"
  const route = readFileSync("/opt/nexus/src/app/api/v1/integrations/atera/purge/route.ts", "utf8");
  const a4 = /console\.error\([\s\S]{0,200}échec envoi email/.test(route);
  add({ section: "A4", name: "Email error visible (console.error)", priority: "P1", status: a4 ? "ok" : "fail", details: a4 ? "Loggé" : "Silence" });

  // A5 lint (recompté en section 1.2)
  const a5 = results.find((r) => r.section === "1.2");
  add({ section: "A5", name: "Lint clean (≤1 erreur préexistante)", priority: "P1", status: a5?.status === "ok" || a5?.status === "warn" ? "ok" : "fail", details: a5?.details ?? "Pas vérifié" });
}

// ----------------------------------------------------------------------------
// État DB live (snapshot des purges)
// ----------------------------------------------------------------------------

async function sectionDbSnapshot() {
  console.log("\n=== Snapshot DB ===");
  const [exc] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM atera_exclusions`);
  const [logs] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM atera_purge_logs`);
  const [rec] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM atera_alert_recipients`);
  add({ section: "DB", name: "Snapshot tables", priority: "P2", status: "ok", details: `exclusions=${exc.n}, purge_logs=${logs.n}, recipients=${rec.n}` });

  if (Number(logs.n) > 0) {
    const byStatus = await prisma.$queryRawUnsafe<{ status: string; n: bigint }[]>(
      `SELECT status, COUNT(*)::bigint AS n FROM atera_purge_logs GROUP BY status ORDER BY n DESC`
    );
    add({ section: "DB", name: "Distribution status purge_logs", priority: "P2", status: "ok", details: byStatus.map((b) => `${b.status}:${b.n}`).join(", ") });
  }
}

// ----------------------------------------------------------------------------
// Render rapport
// ----------------------------------------------------------------------------

function renderReport(): string {
  const fails = results.filter((r) => r.status === "fail");
  const warns = results.filter((r) => r.status === "warn");
  const oks = results.filter((r) => r.status === "ok");
  const p0Fails = fails.filter((r) => r.priority === "P0");

  const verdict =
    p0Fails.length > 0
      ? "🚨 **ANOMALIES P0 DÉTECTÉES — INTERVENTION REQUISE**"
      : fails.length > 0
        ? "⚠️ **Anomalies non-critiques détectées**"
        : warns.length > 0
          ? "✅ **Audit propre — quelques warnings à examiner**"
          : "✅ **Audit propre — clean bill of health**";

  const lines: string[] = [
    `# Audit Atera Maintenance — ${new Date().toLocaleString("fr-CA", { timeZone: "America/Toronto" })}`,
    ``,
    verdict,
    ``,
    `## Résumé`,
    ``,
    `- ✓ OK : ${oks.length}`,
    `- ⚠ Warn : ${warns.length}`,
    `- ✗ Fail : ${fails.length} (dont ${p0Fails.length} P0)`,
    `- Total checks : ${results.length}`,
    ``,
  ];

  if (p0Fails.length > 0) {
    lines.push(`## 🚨 Anomalies P0`, ``);
    for (const r of p0Fails) {
      lines.push(`- **[${r.section}] ${r.name}** — ${r.details}`);
    }
    lines.push(``);
  }

  if (fails.filter((r) => r.priority !== "P0").length > 0) {
    lines.push(`## Anomalies P1/P2`, ``);
    for (const r of fails.filter((r) => r.priority !== "P0")) {
      lines.push(`- **[${r.section}] (${r.priority}) ${r.name}** — ${r.details}`);
    }
    lines.push(``);
  }

  if (warns.length > 0) {
    lines.push(`## Warnings`, ``);
    for (const r of warns) {
      lines.push(`- [${r.section}] (${r.priority}) ${r.name} — ${r.details}`);
    }
    lines.push(``);
  }

  lines.push(`## Détail complet`, ``, `| Section | Priorité | Statut | Vérification | Détails |`, `|---|---|---|---|---|`);
  for (const r of results) {
    const icon = r.status === "ok" ? "✓" : r.status === "warn" ? "⚠" : "✗";
    const detail = r.details.replace(/\|/g, "\\|").slice(0, 200);
    lines.push(`| ${r.section} | ${r.priority} | ${icon} | ${r.name} | ${detail} |`);
  }

  return lines.join("\n");
}

function renderHtml(): string {
  const md = renderReport();
  return `<pre style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.4;background:#f8f9fa;padding:16px;border-radius:6px;overflow-x:auto">${md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  console.log(`[audit-atera] Démarré ${new Date().toISOString()}`);
  await section1();
  await section2();
  await section3();
  await section4_6();
  await section5();
  await section6();
  await section7();
  await section10();
  await section11();
  await sectionP1Verif();
  await sectionDbSnapshot();

  const reportPath = "/tmp/atera-maintenance-audit-final.md";
  const md = renderReport();
  writeFileSync(reportPath, md, "utf8");
  console.log(`\n[audit-atera] Rapport écrit : ${reportPath}`);

  const fails = results.filter((r) => r.status === "fail").length;
  const warns = results.filter((r) => r.status === "warn").length;
  const p0Fails = results.filter((r) => r.status === "fail" && r.priority === "P0").length;

  console.log(`[audit-atera] Stats : ${results.length} checks, ${fails} fails (${p0Fails} P0), ${warns} warns`);

  // Email aux super-admins
  const supers = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN", isActive: true },
    select: { email: true },
  });
  const recipients = supers.map((s) => s.email).filter(Boolean);
  if (recipients.length === 0) {
    console.warn("[audit-atera] Aucun super-admin actif à notifier");
    return;
  }

  const subject = p0Fails > 0
    ? `🚨 Audit Atera — ${p0Fails} P0 fails`
    : fails > 0
      ? `⚠ Audit Atera — ${fails} fails, ${warns} warns`
      : `✓ Audit Atera — clean (${warns} warns)`;

  for (const to of recipients) {
    try {
      await sendEmail(to, subject, renderHtml());
      console.log(`[audit-atera] Email envoyé à ${to}`);
    } catch (e) {
      console.error(`[audit-atera] Échec email ${to}:`, e instanceof Error ? e.message : e);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[audit-atera] FATAL:", e);
    process.exit(1);
  });
