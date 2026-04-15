import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg(process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus");
const prisma = new PrismaClient({ adapter });
async function main() {
  const cetix = await prisma.organization.findFirst({
    where: { OR: [{ clientCode: "CTX" }, { name: { equals: "Cetix", mode: "insensitive" } }] },
    select: { id: true, name: true, isInternal: true },
  });
  if (!cetix) {
    console.log("Aucune org Cetix trouvée.");
    await prisma.$disconnect();
    return;
  }
  if (cetix.isInternal) {
    console.log(`✓ "${cetix.name}" déjà marquée isInternal=true`);
  } else {
    await prisma.organization.update({ where: { id: cetix.id }, data: { isInternal: true } });
    console.log(`+ "${cetix.name}" marquée isInternal=true`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
