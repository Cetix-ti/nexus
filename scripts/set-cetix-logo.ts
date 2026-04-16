// Copie /opt/nexus/images/cetix-transparent-emblem.png vers le dossier
// public servi par Next.js, puis set le champ logo de l'organisation
// interne Cetix. Le logo apparaît comme thumbnail pour les événements
// de type "company_meeting" dans le calendrier Localisation.
//
// Idempotent — utilise un nom de fichier stable dans public/images/.

import fs from "node:fs";
import path from "node:path";
import prisma from "../src/lib/prisma";

const SRC = "/opt/nexus/images/cetix-transparent-emblem.png";
const DEST_DIR = "/opt/nexus/public/images";
const DEST_NAME = "cetix-transparent-emblem.png";
const PUBLIC_PATH = `/images/${DEST_NAME}`;

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source introuvable : ${SRC}`);
    process.exit(1);
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });
  const dest = path.join(DEST_DIR, DEST_NAME);
  fs.copyFileSync(SRC, dest);
  const size = fs.statSync(dest).size;
  console.log(`✓ logo copié → ${dest} (${size} octets)`);

  const internal = await prisma.organization.findFirst({
    where: { isInternal: true },
    select: { id: true, name: true, logo: true },
  });
  if (!internal) {
    console.error("Aucune org interne trouvée (isInternal=true).");
    process.exit(1);
  }

  if (internal.logo === PUBLIC_PATH) {
    console.log(`✓ ${internal.name}.logo déjà à ${PUBLIC_PATH} — rien à faire`);
  } else {
    await prisma.organization.update({
      where: { id: internal.id },
      data: { logo: PUBLIC_PATH, logoOverridden: true },
    });
    console.log(`✓ ${internal.name}.logo mis à jour → ${PUBLIC_PATH}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
