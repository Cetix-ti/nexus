#!/usr/bin/env tsx
/**
 * Import Freshservice ZIP → Postgres
 *
 * Usage:
 *   npx tsx scripts/import-freshservice.ts [--purge] [path/to/zip]
 *
 * Default ZIP path: /opt/nexus/freshservice/Freshservice-Data.zip
 */

import { promises as fs } from "fs";
import path from "path";
import { parseFreshserviceZip } from "../src/lib/freshservice/parser";
import { mapFreshserviceToNexus } from "../src/lib/freshservice/mapper";
import { writeMappingResultToDb } from "../src/lib/freshservice/writer";

async function main() {
  const args = process.argv.slice(2);
  const purge = args.includes("--purge");
  const zipPath =
    args.find((a) => !a.startsWith("--")) ||
    "/opt/nexus/freshservice/Freshservice-Data.zip";

  console.log(`\n🔄 Import Freshservice → Nexus`);
  console.log(`   ZIP    : ${zipPath}`);
  console.log(`   Purge  : ${purge ? "OUI" : "non"}\n`);

  try {
    await fs.access(zipPath);
  } catch {
    console.error(`❌ Fichier introuvable: ${zipPath}`);
    process.exit(1);
  }

  console.log("→ Lecture du ZIP...");
  const buffer = await fs.readFile(zipPath);

  console.log("→ Parsing XML...");
  const t0 = Date.now();
  const fsExport = await parseFreshserviceZip(buffer);
  console.log(`  ✓ Parsing terminé en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`    - ${fsExport.companies.length} companies`);
  console.log(`    - ${fsExport.users.length} users`);
  console.log(`    - ${fsExport.groups.length} groups`);
  console.log(`    - ${fsExport.tickets.length} tickets`);
  console.log(`    - ${fsExport.assets.length} assets`);
  console.log(`    - ${fsExport.solutions?.length || 0} articles`);

  console.log("\n→ Mapping Freshservice → Nexus...");
  const t1 = Date.now();
  const result = mapFreshserviceToNexus(fsExport);
  console.log(`  ✓ Mapping terminé en ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  if (result.warnings.length > 0) {
    console.log(`  ⚠ ${result.warnings.length} avertissements de mapping`);
  }

  console.log("\n→ Écriture en base de données...");
  const stats = await writeMappingResultToDb(result, {
    purgeFirst: purge,
    log: (msg) => console.log(msg),
  });

  console.log("\n✅ Import terminé\n");
  console.log("Statistiques:");
  console.log(`  Organizations  : ${stats.organizations.created} créées, ${stats.organizations.updated} mises à jour`);
  console.log(`  Users (techs)  : ${stats.users.created} créés, ${stats.users.updated} mis à jour`);
  console.log(`  Contacts       : ${stats.contacts.created} créés, ${stats.contacts.updated} mis à jour`);
  console.log(`  Queues         : ${stats.queues.created} créées, ${stats.queues.updated} mises à jour`);
  console.log(`  Catégories     : ${stats.categories.created} créées`);
  console.log(`  Tickets        : ${stats.tickets.created} créés, ${stats.tickets.updated} mis à jour`);
  console.log(`    + ${stats.comments} commentaires`);
  console.log(`    + ${stats.activities} activités`);
  console.log(`  Assets         : ${stats.assets.created} créés, ${stats.assets.updated} mis à jour`);
  console.log(`  Cat. articles  : ${stats.articleCategories.created} créées`);
  console.log(`  Articles KB    : ${stats.articles.created} créés, ${stats.articles.updated} mis à jour`);
  console.log(`  Durée totale   : ${(stats.durationMs / 1000).toFixed(1)}s`);

  if (stats.warnings.length > 0) {
    console.log(`\n⚠ ${stats.warnings.length} avertissements (premiers 10):`);
    stats.warnings.slice(0, 10).forEach((w) => console.log(`  - ${w}`));
  }
}

main().catch((e) => {
  console.error("\n❌ Échec:", e);
  process.exit(1);
});
