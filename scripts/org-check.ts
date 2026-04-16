import prisma from "../src/lib/prisma";

async function main() {
  const orgs = await prisma.organization.findMany({
    where: {
      OR: [
        { name: { contains: "Louiseville", mode: "insensitive" } },
        { clientCode: { in: ["LV", "VDL", "LOUISEVILLE"] } },
      ],
    },
    select: { id: true, name: true, clientCode: true, slug: true, domain: true },
  });
  console.log("Louiseville candidates:", JSON.stringify(orgs, null, 2));

  const all = await prisma.organization.findMany({
    select: { name: true, clientCode: true },
    orderBy: { name: "asc" },
  });
  console.log(`\nAll ${all.length} orgs with their clientCode:`);
  for (const o of all) {
    console.log(`  ${o.clientCode ?? "(null)"}\t${o.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
