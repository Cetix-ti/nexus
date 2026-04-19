// ============================================================================
// Script one-shot : renomme le calendrier Nexus « Localisation » en
// « Agenda général » + met à jour la config de synchronisation Outlook.
//
// Le user a déjà renommé le calendrier partagé côté Exchange. Ce script
// aligne le côté Nexus (nom + description + tenantSetting).
//
// Idempotent — si le calendrier est déjà renommé, ne fait rien.
//
// Usage :
//   DATABASE_URL=... npx tsx scripts/rename-calendar-to-agenda-general.ts
// ============================================================================

import prisma from "@/lib/prisma";

const OLD_NAME = "Localisation";
const NEW_NAME = "Agenda général";
const CONFIG_KEY = "calendar.location-sync";

async function main() {
  // 1. Renomme le Calendar record dont le nom matche (case-insensitive).
  const byName = await prisma.calendar.findFirst({
    where: { name: { equals: OLD_NAME, mode: "insensitive" } },
    select: { id: true, name: true, description: true },
  });

  if (byName) {
    console.log(`Renommage du calendrier ${byName.id} : "${byName.name}" → "${NEW_NAME}"`);
    await prisma.calendar.update({
      where: { id: byName.id },
      data: {
        name: NEW_NAME,
        description:
          byName.description &&
          byName.description.toLowerCase().includes("localisation")
            ? "Agenda général de l'équipe (synchronisé avec Outlook)"
            : byName.description,
      },
    });
  } else {
    console.log(`Aucun calendrier « ${OLD_NAME} » trouvé — peut-être déjà renommé ?`);
    const already = await prisma.calendar.findFirst({
      where: { name: { equals: NEW_NAME, mode: "insensitive" } },
      select: { id: true },
    });
    if (already) console.log(`  ✓ Un calendrier « ${NEW_NAME} » existe déjà (${already.id}).`);
  }

  // 2. Met à jour la config tenantSetting — le champ calendarName est lu
  //    par resolveCalendarId() lors de la sync Outlook. Il doit matcher le
  //    displayName du calendrier côté Exchange (qui a déjà été renommé).
  const configRow = await prisma.tenantSetting.findUnique({
    where: { key: CONFIG_KEY },
  });
  if (configRow) {
    const current = configRow.value as Record<string, unknown>;
    const currentName = typeof current.calendarName === "string" ? current.calendarName : null;
    if (currentName && currentName !== NEW_NAME) {
      console.log(`Mise à jour config "${CONFIG_KEY}" : calendarName "${currentName}" → "${NEW_NAME}"`);
      await prisma.tenantSetting.update({
        where: { key: CONFIG_KEY },
        data: {
          value: { ...current, calendarName: NEW_NAME } as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    } else {
      console.log(`Config "${CONFIG_KEY}" déjà à jour (${currentName}).`);
    }
  } else {
    console.log(
      `Config "${CONFIG_KEY}" absente — sera créée au premier appel de ensureNexusCalendar() avec le bon nom.`,
    );
  }

  await prisma.$disconnect();
  console.log("\nTerminé. Redémarre Nexus pour que les caches soient purgés.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
