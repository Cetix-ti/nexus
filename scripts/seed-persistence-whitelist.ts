// One-off — ajoute Splashtop comme règle default (whitelist globale).
// À relancer pour réinitialiser si besoin (idempotent via findFirst).

import prisma from "@/lib/prisma";

async function main() {
  const existing = await prisma.securityPersistenceWhitelist.findFirst({
    where: {
      scope: "default",
      softwareName: { equals: "Splashtop", mode: "insensitive" },
    },
  });
  if (existing) {
    console.log("Splashtop déjà en whitelist (default) :", existing.id);
    return;
  }
  const created = await prisma.securityPersistenceWhitelist.create({
    data: {
      scope: "default",
      softwareName: "Splashtop",
      allowed: true,
      notes: "Outil de télé-assistance utilisé par Cetix — autorisé partout",
    },
  });
  console.log("Whitelist créée :", created.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
