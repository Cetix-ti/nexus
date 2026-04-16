import prisma from "../src/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

function generateStrongPassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZ" +
    "abcdefghijkmnpqrstuvwxyz" +
    "23456789" +
    "!@#$%^&*-_=+?";
  const bytes = crypto.randomBytes(28);
  let out = "";
  for (let i = 0; i < 28; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function main() {
  const EMAIL = "localadmin@cetix.ca";
  const password = generateStrongPassword();
  const hash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: hash,
        role: "SUPER_ADMIN",
        isActive: true,
        firstName: "Local",
        lastName: "Admin",
      },
    });
    console.log("✓ Agent mis à jour (email existait déjà)");
  } else {
    await prisma.user.create({
      data: {
        email: EMAIL,
        passwordHash: hash,
        firstName: "Local",
        lastName: "Admin",
        role: "SUPER_ADMIN",
        isActive: true,
        locale: "fr",
      },
    });
    console.log("✓ Agent créé");
  }

  console.log("\n========================================");
  console.log("  NOTE CES IDENTIFIANTS MAINTENANT");
  console.log("========================================");
  console.log(`  Email    : ${EMAIL}`);
  console.log(`  Password : ${password}`);
  console.log("========================================");
  console.log(`\n  Role     : SUPER_ADMIN`);
  console.log(`  Login    : http://192.168.200.42:3000/login`);
  console.log(`             (marche aussi sur http://192.168.200.41:3000 et https://nexus.cetix.ca)`);
  console.log("\n  Le mot de passe NE SERA PLUS JAMAIS AFFICHÉ.");
  console.log("  Pour le réinitialiser : relance `npx tsx scripts/_create-local-admin.ts`");

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
