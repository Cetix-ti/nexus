// Ajoute Jacques Thibault (JT) comme agent TECHNICIAN actif.
// Nécessaire pour que le décodeur de titres de localisation reconnaisse
// les events "JT VDSA (8H00)", "BR/JT VDSA", etc.
// Idempotent : si JT existe déjà (par email), on ne fait rien.
//
// Usage : npx tsx scripts/add-jacques-thibault.ts

import prisma from "../src/lib/prisma";

const EMAIL = "jacques.thibault@cetix.ca";

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, isActive: true, role: true },
  });

  if (existing) {
    // S'il existe déjà mais inactif/pas agent, on le remet en état utile.
    if (
      !existing.isActive ||
      !["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR", "TECHNICIAN"].includes(
        existing.role,
      )
    ) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isActive: true, role: "TECHNICIAN" },
      });
      console.log(`✓ Jacques Thibault réactivé (${existing.id})`);
    } else {
      console.log(`✓ Jacques Thibault existe déjà (${existing.id}) — rien à faire`);
    }
    await prisma.$disconnect();
    return;
  }

  const created = await prisma.user.create({
    data: {
      email: EMAIL,
      firstName: "Jacques",
      lastName: "Thibault",
      role: "TECHNICIAN",
      isActive: true,
      locale: "fr",
    },
    select: { id: true },
  });
  console.log(`+ Jacques Thibault créé (${created.id})`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
