// Seed manuel des calendarAliases pour les orgs dont l'abréviation Cetix
// ne suit pas une règle dérivable. L'heuristique du décodeur couvre déjà
// la plupart des cas (VDM, MRVL, SADB, …) — ici on comble les exceptions.
//
// Idempotent : on fait un merge set-union avec les alias existants.

import prisma from "../src/lib/prisma";

const SEED: Record<string, string[]> = {
  "Ville de Louiseville": ["LV", "VDL"],
  // Ajouter ici toute autre exception observée.
};

async function main() {
  let updated = 0;
  for (const [name, aliases] of Object.entries(SEED)) {
    const org = await prisma.organization.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true, calendarAliases: true, name: true },
    });
    if (!org) {
      console.warn(`  ✗ ${name} — introuvable en DB`);
      continue;
    }
    const existing = new Set(org.calendarAliases ?? []);
    const next = Array.from(new Set([...existing, ...aliases]));
    if (next.length === existing.size) {
      console.log(`  = ${org.name} — déjà à jour (${next.join(", ")})`);
      continue;
    }
    await prisma.organization.update({
      where: { id: org.id },
      data: { calendarAliases: next },
    });
    updated++;
    console.log(`  ✓ ${org.name} — ${next.join(", ")}`);
  }
  console.log(`\n✓ ${updated} org(s) mises à jour.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
