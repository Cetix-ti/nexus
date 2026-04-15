import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus",
);
const prisma = new PrismaClient({ adapter });

/**
 * Invariant métier : la SEULE organisation marquée "interne" est Cetix.
 * (Preventix pourra l'être plus tard depuis l'UI Paramètres org.)
 * Ce script :
 *   - Marque Cetix isInternal=true (idempotent)
 *   - Désactive le flag sur toute autre org qui l'aurait par erreur
 *     (ex: activation accidentelle via le Switch d'édition d'org)
 */
async function main() {
  const cetix = await prisma.organization.findFirst({
    where: { OR: [{ clientCode: "CTX" }, { name: { equals: "Cetix", mode: "insensitive" } }] },
    select: { id: true, name: true, isInternal: true },
  });

  if (!cetix) {
    console.log("⚠ Aucune org Cetix trouvée — rien à faire.");
    await prisma.$disconnect();
    return;
  }

  if (cetix.isInternal) {
    console.log(`✓ "${cetix.name}" déjà marquée isInternal=true`);
  } else {
    await prisma.organization.update({
      where: { id: cetix.id },
      data: { isInternal: true },
    });
    console.log(`+ "${cetix.name}" marquée isInternal=true`);
  }

  // Retire le flag sur toute autre organisation.
  const stray = await prisma.organization.findMany({
    where: { isInternal: true, id: { not: cetix.id } },
    select: { id: true, name: true },
  });
  if (stray.length > 0) {
    await prisma.organization.updateMany({
      where: { id: { in: stray.map((s) => s.id) } },
      data: { isInternal: false },
    });
    for (const s of stray) {
      console.log(`- "${s.name}" : isInternal retiré (ne doit pas être interne).`);
    }
  } else {
    console.log(`✓ Aucune autre org marquée isInternal — état cohérent.`);
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
