/**
 * Seed initial des calendriers par défaut.
 * Idempotent — ne crée que ce qui manque.
 *   Run : npx tsx scripts/seed-calendars.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus",
);
const prisma = new PrismaClient({ adapter });

const DEFAULTS = [
  {
    name: "Renouvellements",
    description:
      "Licences logicielles, certificats SSL, abonnements, garanties matériel, contrats fournisseurs.",
    kind: "RENEWALS" as const,
    color: "#F59E0B", // amber
  },
  {
    name: "Congés & absences",
    description: "Vacances, congés maladie, formation, journées personnelles des techniciens.",
    kind: "LEAVE" as const,
    color: "#8B5CF6", // violet
  },
  {
    name: "Agenda général",
    description:
      "Où travaillent les techs (client, bureau, télétravail), rencontres internes, événements perso, indisponibilités.",
    kind: "GENERAL" as const,
    color: "#3B82F6", // blue
  },
];

async function main() {
  for (const def of DEFAULTS) {
    const existing = await prisma.calendar.findFirst({
      where: { kind: def.kind },
    });
    if (existing) {
      console.log(`✓ "${def.name}" (${def.kind}) existe déjà`);
      continue;
    }
    const created = await prisma.calendar.create({ data: def });
    console.log(`+ "${created.name}" (${created.kind}) créé`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
