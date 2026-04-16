// Supprime le calendrier "Agenda général" et déplace ses événements
// vers "Localisation" (le nouveau calendrier principal de localisation
// des agents, qui est aussi kind=GENERAL).
//
// Idempotent : ne fait rien si "Agenda général" n'existe pas.

import prisma from "../src/lib/prisma";

async function main() {
  const agendaGeneral = await prisma.calendar.findFirst({
    where: { name: { equals: "Agenda général", mode: "insensitive" } },
    select: { id: true, _count: { select: { events: true } } },
  });

  if (!agendaGeneral) {
    console.log("« Agenda général » absent — rien à faire.");
    await prisma.$disconnect();
    return;
  }

  const localisation = await prisma.calendar.findFirst({
    where: { name: { equals: "Localisation", mode: "insensitive" } },
    select: { id: true },
  });

  if (!localisation) {
    console.error(
      "❌ Impossible de trouver le calendrier « Localisation ». " +
        "Assure-toi que la sync Outlook l'a créé avant de supprimer « Agenda général »."
    );
    process.exit(1);
  }

  console.log(
    `Déplacement de ${agendaGeneral._count.events} événement(s) « Agenda général » → « Localisation »…`,
  );
  const moved = await prisma.calendarEvent.updateMany({
    where: { calendarId: agendaGeneral.id },
    data: { calendarId: localisation.id },
  });
  console.log(`  ${moved.count} déplacé(s).`);

  await prisma.calendar.delete({ where: { id: agendaGeneral.id } });
  console.log("✓ « Agenda général » supprimé.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
