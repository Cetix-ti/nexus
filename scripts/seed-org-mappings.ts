// One-off — seed les mappings org demandés :
//   - Clinique Vétérinaire Liesse → clientCode = "CVL"
//   - Hulix Construction         → endpointPatterns = ["STATION-LAV"]
//
// Idempotent : on ne touche pas aux orgs qui ont déjà la valeur cible.

import prisma from "@/lib/prisma";

async function setClientCode(orgName: string, code: string) {
  const org = await prisma.organization.findFirst({
    where: { name: { equals: orgName, mode: "insensitive" } },
    select: { id: true, clientCode: true, slug: true },
  });
  if (!org) {
    console.warn(`✗ Organisation "${orgName}" introuvable`);
    return;
  }
  const upper = code.toUpperCase();
  if (org.clientCode === upper) {
    console.log(`  ${orgName} : clientCode déjà "${upper}", skip`);
    return;
  }
  if (org.clientCode) {
    console.warn(
      `  ${orgName} : clientCode actuel "${org.clientCode}" → écrasé par "${upper}"`,
    );
  }
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      clientCode: upper,
      slug: upper.toLowerCase(),
    },
  });
  console.log(`✓ ${orgName} : clientCode = ${upper}`);
}

async function addEndpointPatterns(orgName: string, patterns: string[]) {
  const org = await prisma.organization.findFirst({
    where: { name: { equals: orgName, mode: "insensitive" } },
    select: { id: true, endpointPatterns: true },
  });
  if (!org) {
    console.warn(`✗ Organisation "${orgName}" introuvable`);
    return;
  }
  const upperPatterns = patterns.map((p) => p.trim().toUpperCase()).filter((p) => p.length >= 2);
  const set = new Set([...(org.endpointPatterns ?? []), ...upperPatterns]);
  if (set.size === (org.endpointPatterns ?? []).length) {
    console.log(`  ${orgName} : patterns déjà présents, skip`);
    return;
  }
  await prisma.organization.update({
    where: { id: org.id },
    data: { endpointPatterns: Array.from(set) },
  });
  console.log(`✓ ${orgName} : endpointPatterns = [${Array.from(set).join(", ")}]`);
}

async function main() {
  await setClientCode("Clinique Vétérinaire Liesse", "CVL");
  await addEndpointPatterns("Hulix Construction", ["STATION-LAV"]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
