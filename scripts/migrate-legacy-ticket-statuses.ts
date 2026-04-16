// Migre les statuts hérités de Freshservice vers le set réduit de Nexus.
//
//   OPEN            → IN_PROGRESS
//   ON_SITE         → IN_PROGRESS  (+ requiresOnSite = true pour préserver
//                                    le signal "à faire sur place")
//   PENDING         → WAITING_CLIENT
//   WAITING_VENDOR  → WAITING_CLIENT
//
// NEW, IN_PROGRESS, WAITING_CLIENT, SCHEDULED, RESOLVED, CLOSED,
// CANCELLED, DELETED restent inchangés — ce sont les statuts officiels
// Nexus ou la corbeille.
//
// Idempotent : peut être relancé sans effet de bord. Imprime un récap
// pour chaque statut migré.

import prisma from "../src/lib/prisma";

async function main() {
  const start = Date.now();

  // OPEN → IN_PROGRESS
  const openRes = await prisma.ticket.updateMany({
    where: { status: "OPEN" as never },
    data: { status: "IN_PROGRESS" as never },
  });
  console.log(`OPEN            → IN_PROGRESS   : ${openRes.count} tickets`);

  // ON_SITE → IN_PROGRESS + requiresOnSite=true
  // On ne peut pas mettre les deux champs en un updateMany avec une valeur
  // dépendante, mais ici c'est statique : on force status et le flag.
  const onSiteRes = await prisma.ticket.updateMany({
    where: { status: "ON_SITE" as never },
    data: { status: "IN_PROGRESS" as never, requiresOnSite: true },
  });
  console.log(`ON_SITE         → IN_PROGRESS+🌿 : ${onSiteRes.count} tickets`);

  // PENDING → WAITING_CLIENT
  const pendingRes = await prisma.ticket.updateMany({
    where: { status: "PENDING" as never },
    data: { status: "WAITING_CLIENT" as never },
  });
  console.log(`PENDING         → WAITING_CLIENT : ${pendingRes.count} tickets`);

  // WAITING_VENDOR → WAITING_CLIENT
  const wvRes = await prisma.ticket.updateMany({
    where: { status: "WAITING_VENDOR" as never },
    data: { status: "WAITING_CLIENT" as never },
  });
  console.log(`WAITING_VENDOR  → WAITING_CLIENT : ${wvRes.count} tickets`);

  const total = openRes.count + onSiteRes.count + pendingRes.count + wvRes.count;
  console.log(
    `\n✓ ${total} tickets migrés en ${((Date.now() - start) / 1000).toFixed(1)} s.`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
