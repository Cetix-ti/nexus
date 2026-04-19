// ============================================================================
// Normalise les noms d'endpoints dans les SecurityIncident + SecurityAlert
// existants (retire le préfixe client). Applique aussi le strip sur le
// titre et le sommaire — ces champs contenaient le nom brut "MRVL_X" alors
// qu'on affiche maintenant "X".
//
// Idempotent : re-run sans effet si tout est déjà propre.
//
// Usage :
//   DATABASE_URL=... npx tsx scripts/normalize-security-endpoints.ts --dry-run
//   DATABASE_URL=... npx tsx scripts/normalize-security-endpoints.ts
// ============================================================================

import prisma from "@/lib/prisma";
import { stripClientCodePrefix } from "@/lib/security-center/endpoint-utils";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (DRY_RUN) {
    console.log("*** DRY RUN — aucune écriture ***\n");
  }

  // On ne touche QUE les incidents Wazuh (source=wazuh_email / wazuh_api /
  // persistence via wazuh_email). Les sources AD et Bitdefender ont déjà
  // des noms d'endpoint propres.
  const incidents = await prisma.securityIncident.findMany({
    where: {
      source: { in: ["wazuh_email", "wazuh_api"] },
      endpoint: { not: null },
    },
    select: {
      id: true,
      endpoint: true,
      title: true,
      summary: true,
      organizationId: true,
    },
  });

  console.log(`Scanning ${incidents.length} incidents Wazuh…`);

  // Map org → clientCode pour résoudre le préfixe à retirer.
  const orgIds = Array.from(
    new Set(incidents.map((i) => i.organizationId).filter((x): x is string => !!x)),
  );
  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, clientCode: true },
  });
  const codeByOrg = new Map(
    orgs.map((o) => [o.id, o.clientCode?.trim() ?? null]),
  );

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const inc of incidents) {
    const clientCode = inc.organizationId
      ? codeByOrg.get(inc.organizationId) ?? null
      : null;
    if (!clientCode) {
      skipped++;
      continue;
    }
    const oldEndpoint = inc.endpoint!;
    const newEndpoint = stripClientCodePrefix(oldEndpoint, clientCode) ?? oldEndpoint;
    const endpointChanged = newEndpoint !== oldEndpoint;

    // Remplace TOUTES les occurrences du vieux nom dans title + summary.
    // On utilise une regex globale \b(...)\b pour éviter de matcher un
    // sous-string accidentel.
    const rx = new RegExp(
      `\\b${oldEndpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "g",
    );
    const newTitle = inc.title.replace(rx, newEndpoint);
    const newSummary = inc.summary
      ? inc.summary.replace(rx, newEndpoint)
      : inc.summary;

    if (!endpointChanged && newTitle === inc.title && newSummary === inc.summary) {
      unchanged++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.securityIncident.update({
        where: { id: inc.id },
        data: {
          endpoint: newEndpoint,
          title: newTitle,
          summary: newSummary,
        },
      });
      // Met à jour les alertes liées (elles stockent aussi endpoint/title/summary).
      await prisma.securityAlert.updateMany({
        where: { incidentId: inc.id },
        data: { endpoint: newEndpoint },
      });
    }
    updated++;
    console.log(
      `  [${DRY_RUN ? "DRY" : "FIX"}] ${oldEndpoint.padEnd(28)} → ${newEndpoint}`,
    );
  }

  console.log(
    `\n${updated} mis à jour, ${unchanged} déjà propres, ${skipped} ignorés (pas de clientCode).`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
