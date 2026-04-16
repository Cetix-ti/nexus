// Normalise la fin des events all-day importés d'Outlook :
// Outlook encode "exclusive end" (end = minuit du lendemain). Nexus
// affiche la fin exclusive comme le jour suivant → UI pétée. On ramène
// la fin à 23:59:59.999 du jour précédent pour tous les events all-day
// dont endsAt est pile à minuit.
//
// Idempotent.

import prisma from "../src/lib/prisma";

async function main() {
  const events = await prisma.calendarEvent.findMany({
    where: { allDay: true },
    select: { id: true, title: true, startsAt: true, endsAt: true },
  });
  console.log(`All-day events : ${events.length}`);

  let fixed = 0;
  for (const e of events) {
    const end = e.endsAt;
    const atMidnight =
      end.getUTCHours() === 0 &&
      end.getUTCMinutes() === 0 &&
      end.getUTCSeconds() === 0 &&
      end.getUTCMilliseconds() === 0;
    if (!atMidnight) continue;
    if (end.getTime() <= e.startsAt.getTime()) continue;
    const newEnd = new Date(end.getTime() - 1);
    await prisma.calendarEvent.update({
      where: { id: e.id },
      data: { endsAt: newEnd },
    });
    fixed++;
  }
  console.log(`✓ ${fixed} events normalisés (fin -1 ms).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
