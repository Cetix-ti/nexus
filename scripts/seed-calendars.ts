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
  // Le GENERAL par défaut est "Localisation" — synchronisé bidir avec
  // le calendrier partagé Outlook du même nom. C'est le calendrier
  // principal où les techs saisissent où ils sont (client, bureau,
  // télétravail). Si la synchro Outlook n'a jamais tourné, on le crée
  // quand même ici pour que les modales de création d'event aient un
  // calendrier GENERAL par défaut. L'ancien « Agenda général » a été
  // retiré (cf. scripts/remove-agenda-general.ts).
  {
    name: "Localisation",
    description: "Localisation des agents (synchronisé avec Outlook).",
    kind: "GENERAL" as const,
    color: "#0EA5E9", // sky — cohérent avec location-sync.ts
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
