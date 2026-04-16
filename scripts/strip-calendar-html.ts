// Nettoie les descriptions d'événements calendrier qui contiennent du HTML.
// Outlook envoie `body.content` en HTML même quand l'utilisateur n'a saisi
// aucune description, ce qui faisait apparaître des balises "en brut" dans
// le drawer Nexus. Cette correction est appliquée au prochain sync, mais
// pour les events déjà en DB non modifiés depuis dans Outlook, on les
// nettoie directement ici. Idempotent.

import prisma from "../src/lib/prisma";

function stripHtmlToText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let text = raw
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
  text = text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > 0 ? text : null;
}

async function main() {
  // On examine TOUS les events avec une description, pas seulement ceux
  // synchronisés depuis Outlook — un utilisateur peut aussi avoir créé
  // manuellement un event avec une description HTML via un client API.
  const events = await prisma.calendarEvent.findMany({
    where: { description: { not: null } },
    select: { id: true, description: true },
  });
  console.log(`Events à examiner : ${events.length}`);

  let cleaned = 0;
  let emptied = 0;
  for (const e of events) {
    const desc = e.description ?? "";
    const hasTags = /<[a-z][\s\S]*>/i.test(desc);
    const hasEntities = /&[a-z]+;|&#\d+;/i.test(desc);
    if (!hasTags && !hasEntities) continue;
    const plain = stripHtmlToText(desc);
    await prisma.calendarEvent.update({
      where: { id: e.id },
      data: { description: plain },
    });
    if (plain === null) emptied++;
    cleaned++;
  }
  console.log(`✓ ${cleaned} events nettoyés (${emptied} vidés → null).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
