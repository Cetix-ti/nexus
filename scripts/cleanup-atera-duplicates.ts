// One-shot cleanup : déduplique les actifs Atera créés en double à cause
// du double code path (atera-sync.ts utilisait l'ID brut, l'API
// /atera/customers/[id]/agents utilisait `atera_${id}`).
//
// Stratégie :
//   1. Trouver les paires `(orgId, name)` où il y a >= 2 rows externalSource='atera'
//   2. Garder le row le plus récent (updatedAt DESC), supprimer les autres
//   3. Pour les rows survivants dont externalId commence par "atera_",
//      le strip pour qu'ils correspondent au format canonique
//
// Inventaire préalable confirmé : aucun ticket / note / licence software
// rattaché aux rows à supprimer (script lancé avant pour valider).
//
// Run : `npx tsx scripts/cleanup-atera-duplicates.ts` (DRY-RUN par défaut)
// Pour exécuter : `npx tsx scripts/cleanup-atera-duplicates.ts --apply`

import prisma from "../src/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[cleanup-atera] Mode: ${apply ? "APPLY (destructive)" : "DRY-RUN"}`);

  const ateraAssets = await prisma.asset.findMany({
    where: { externalSource: "atera" },
    select: {
      id: true, organizationId: true, name: true, externalId: true,
      createdAt: true, updatedAt: true,
      organization: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Group by (orgId, name) — chaque clé est un "vrai" actif en DB
  const groups = new Map<string, typeof ateraAssets>();
  for (const a of ateraAssets) {
    const k = `${a.organizationId}|${a.name}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }

  // Identifier les survivants (le 1er = le plus récent grâce au orderBy)
  // et les rows à supprimer (le reste)
  const toDelete: string[] = [];
  const toRenameToBare: { id: string; from: string; to: string }[] = [];
  let untouched = 0;
  for (const rows of groups.values()) {
    if (rows.length === 1) {
      const a = rows[0];
      if (a.externalId?.startsWith("atera_")) {
        const bare = a.externalId.replace(/^atera_/, "");
        toRenameToBare.push({ id: a.id, from: a.externalId, to: bare });
      } else {
        untouched++;
      }
      continue;
    }
    // Plusieurs rows : on garde le 1er, on supprime les autres
    const [keep, ...rest] = rows;
    for (const r of rest) toDelete.push(r.id);
    if (keep.externalId?.startsWith("atera_")) {
      const bare = keep.externalId.replace(/^atera_/, "");
      toRenameToBare.push({ id: keep.id, from: keep.externalId, to: bare });
    }
  }

  console.log(`[cleanup-atera] Stats:`);
  console.log(`  - Total rows Atera: ${ateraAssets.length}`);
  console.log(`  - Groupes uniques: ${groups.size}`);
  console.log(`  - Rows à supprimer (doublons): ${toDelete.length}`);
  console.log(`  - Rows à renommer (atera_ → bare): ${toRenameToBare.length}`);
  console.log(`  - Rows déjà bons: ${untouched}`);

  if (!apply) {
    console.log(`\n[cleanup-atera] DRY-RUN — aucune écriture. Re-lancer avec --apply pour exécuter.`);
    process.exit(0);
  }

  // Suppressions par batch de 200
  console.log(`\n[cleanup-atera] Suppression de ${toDelete.length} rows…`);
  for (let i = 0; i < toDelete.length; i += 200) {
    const slice = toDelete.slice(i, i + 200);
    await prisma.asset.deleteMany({ where: { id: { in: slice } } });
    process.stdout.write(`.`);
  }
  console.log(`\n[cleanup-atera] Suppression terminée.`);

  // Renommage des externalId préfixés (en deux passes pour éviter les
  // collisions transitoires avec un row qui aurait déjà l'ID bare)
  console.log(`[cleanup-atera] Renommage de ${toRenameToBare.length} externalId…`);
  for (const r of toRenameToBare) {
    await prisma.asset.update({
      where: { id: r.id },
      data: { externalId: r.to },
    });
  }
  console.log(`[cleanup-atera] Renommage terminé.`);

  // Vérification finale
  const after = await prisma.asset.count({ where: { externalSource: "atera" } });
  const stillPrefixed = await prisma.asset.count({
    where: { externalSource: "atera", externalId: { startsWith: "atera_" } },
  });
  console.log(`\n[cleanup-atera] Résultat final:`);
  console.log(`  - Rows Atera restants: ${after}`);
  console.log(`  - Encore préfixés: ${stillPrefixed} (doit être 0)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
