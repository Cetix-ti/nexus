// ============================================================================
// ATERA — Purge des actifs inactifs (CLI)
// ============================================================================
// Wrapper léger autour de la lib partagée src/lib/integrations/atera-purge.ts.
// Utilisez plutôt l'UI Settings → Intégrations → Atera → Maintenance pour
// l'usage interactif. Cette CLI est utile pour :
//   - les jobs cron / CI (ex: purge mensuelle automatique)
//   - le debug rapide depuis un terminal
//   - les inspections (--inspect) sans toucher à la DB Nexus
//
// Usage:
//   npx tsx scripts/atera-purge-inactive.ts                # dry-run, 365j
//   npx tsx scripts/atera-purge-inactive.ts --days=180     # seuil 180j
//   npx tsx scripts/atera-purge-inactive.ts --inspect      # dump 1 agent brut
//   npx tsx scripts/atera-purge-inactive.ts --apply --yes  # exécution réelle
//   npx tsx scripts/atera-purge-inactive.ts --apply --yes --actor=<userId>
//   npx tsx scripts/atera-purge-inactive.ts --apply --yes --asset-action=keep
//
// La CLI requiert un --actor=<userId Nexus> en mode --apply pour tracer le
// AteraPurgeLog. Si non fourni, on prend le 1er super-admin actif trouvé.

import { config as loadEnv } from "dotenv";
loadEnv();

import { writeFileSync } from "node:fs";
import prisma from "../src/lib/prisma";
import { listAllAteraAgents } from "../src/lib/integrations/atera-client";
import {
  findInactiveAgents,
  purgeAgents,
  type LinkedAssetAction,
} from "../src/lib/integrations/atera-purge";

// ----- Args ------------------------------------------------------------------
function getArg(name: string, defaultValue?: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  if (process.argv.includes(`--${name}`)) return "true";
  return defaultValue;
}

const DAYS = Number(getArg("days", "365"));
const APPLY = !!getArg("apply");
const YES = !!getArg("yes");
const INSPECT = !!getArg("inspect");
const LIMIT = Number(getArg("limit", "0"));
const ACTOR_ID = getArg("actor");
const ASSET_ACTION = (getArg("asset-action", "archive") as LinkedAssetAction);

if (!Number.isFinite(DAYS) || DAYS <= 0) {
  console.error(`[atera-purge] --days invalide: ${DAYS}`);
  process.exit(1);
}
if (!["archive", "keep", "delete", "none"].includes(ASSET_ACTION)) {
  console.error(`[atera-purge] --asset-action invalide: ${ASSET_ACTION}`);
  process.exit(1);
}

// ----- Main ------------------------------------------------------------------
async function main() {
  console.log(`[atera-purge] Mode: ${APPLY ? "APPLY (DESTRUCTIVE)" : "DRY-RUN"}`);
  console.log(`[atera-purge] Seuil: ${DAYS} jours d'inactivité`);
  if (APPLY) {
    console.log(`[atera-purge] Action asset Nexus: ${ASSET_ACTION}`);
  }

  if (INSPECT) {
    console.log(`[atera-purge] Téléchargement d'un agent (inspection)…`);
    const agents = await listAllAteraAgents();
    const sample = agents[0];
    if (!sample) {
      console.log(`[atera-purge] Aucun agent à inspecter.`);
      return;
    }
    console.log(`\n[atera-purge] Champs disponibles sur le 1er agent :`);
    console.log(JSON.stringify(sample, null, 2));
    return;
  }

  console.log(`[atera-purge] Téléchargement des agents (paginé)…`);
  const candidates = await findInactiveAgents({
    days: DAYS,
    includeExcluded: false, // CLI ne propose pas les exclus
    onPage: (p, total) => process.stdout.write(`\r  page ${p}/${total}`),
  });
  console.log(`\n[atera-purge] ${candidates.length} candidats à la purge.`);

  if (candidates.length === 0) {
    console.log(`[atera-purge] Rien à supprimer. Fin.`);
    return;
  }

  // Tri du plus ancien au plus récent
  candidates.sort(
    (a, b) => (a.daysSinceLastSeen ?? 0) - (b.daysSinceLastSeen ?? 0)
  );
  candidates.reverse(); // les + vieux en premier dans la preview

  // Preview console (top 25)
  console.log(`\n[atera-purge] Aperçu (25 plus anciens) :`);
  console.log(
    `  ${"AgentID".padEnd(10)} ${"Machine".padEnd(30)} ${"Client".padEnd(28)} ${"Champ".padEnd(14)} ${"Jours".padStart(6)} Liens`
  );
  for (const r of candidates.slice(0, 25)) {
    const links = r.linkedAsset
      ? `${r.linkedAsset.ticketCount}T ${r.linkedAsset.noteCount}N ${r.linkedAsset.licenseCount}L`
      : "—";
    console.log(
      `  ${String(r.agentId).padEnd(10)} ${r.machineName.slice(0, 29).padEnd(30)} ${r.customerName.slice(0, 27).padEnd(28)} ${r.lastActivityField.padEnd(14)} ${String(r.daysSinceLastSeen).padStart(6)} ${links}`
    );
  }
  if (candidates.length > 25) console.log(`  … et ${candidates.length - 25} autres`);

  // CSV pour traçabilité
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = `/tmp/atera-purge-${ts}.csv`;
  const csv = [
    "AgentID,MachineName,CustomerName,OSType,LastActivityField,LastActivity,DaysSince,LinkedAssetId,Tickets,Notes,Licenses",
    ...candidates.map((r) =>
      [
        r.agentId,
        JSON.stringify(r.machineName),
        JSON.stringify(r.customerName),
        JSON.stringify(r.osType),
        r.lastActivityField,
        r.lastActivityAt ?? "",
        r.daysSinceLastSeen ?? "",
        r.linkedAsset?.id ?? "",
        r.linkedAsset?.ticketCount ?? 0,
        r.linkedAsset?.noteCount ?? 0,
        r.linkedAsset?.licenseCount ?? 0,
      ].join(",")
    ),
  ].join("\n");
  writeFileSync(csvPath, csv, "utf8");
  console.log(`\n[atera-purge] Liste complète exportée : ${csvPath}`);

  if (!APPLY) {
    console.log(
      `\n[atera-purge] DRY-RUN — aucune suppression. Pour appliquer :`
    );
    console.log(
      `  npx tsx scripts/atera-purge-inactive.ts --days=${DAYS} --apply --yes`
    );
    return;
  }

  // Résolution de l'acteur
  let actorUserId = ACTOR_ID;
  if (!actorUserId) {
    const sa = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    if (!sa) {
      console.error(
        `[atera-purge] Aucun super-admin trouvé pour servir d'acteur. Précisez --actor=<userId>.`
      );
      process.exit(1);
    }
    actorUserId = sa.id;
    console.log(`[atera-purge] Acteur : ${sa.email} (${sa.id})`);
  }

  // Garde-fou si --yes absent
  if (!YES) {
    console.log(
      `\n[atera-purge] ⚠  --apply demandé sans --yes. Suppression dans 10s — Ctrl+C pour annuler.`
    );
    for (let i = 10; i > 0; i--) {
      process.stdout.write(`\r  ${i}s…`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log("");
  }

  const targets = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;
  console.log(`\n[atera-purge] Suppression de ${targets.length} agents…`);

  const result = await purgeAgents({
    agentIds: targets.map((t) => t.agentId),
    actorUserId,
    reason: `CLI batch — seuil ${DAYS}j`,
    linkedAssetAction: ASSET_ACTION,
    onProgress: (done, total) => {
      process.stdout.write(
        `\r  ${done}/${total} OK (${result?.okCount ?? 0}) ERR (${result?.errorCount ?? 0})`
      );
    },
  });

  console.log(
    `\n[atera-purge] Terminé. batchId=${result.batchId} — OK=${result.okCount}, ERR=${result.errorCount}, SKIP=${result.skippedCount}`
  );
  if (result.errors.length) {
    console.log(`[atera-purge] Erreurs (10 premières) :`);
    for (const e of result.errors.slice(0, 10)) {
      console.log(`  - ${e.agentId}: ${e.error}`);
    }
  }
  if (result.skipped.length) {
    console.log(`[atera-purge] Skippés (10 premiers) :`);
    for (const s of result.skipped.slice(0, 10)) {
      console.log(`  - ${s.agentId}: ${s.reason}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
