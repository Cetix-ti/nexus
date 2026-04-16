// Aligne toutes les organisations existantes avec les defaults du portail :
//   - portalEnabled             = true
//   - portalAuthProviders       = ["microsoft","google","local"] (set union)
//   - portalDefaultRole         = "STANDARD" (si null)
//
// Idempotent : peut être relancé. N'écrase JAMAIS un portalAuthProviders déjà
// renseigné sauf pour COMPLÉTER (union), pour qu'un admin qui a volontairement
// désactivé un provider ne voie pas sa config écrasée silencieusement.
//
// Doit être lancé AVANT `prisma db push` si on rend portalDefaultRole
// non-null dans le schéma — sinon la push échoue sur les NULL existants.

import prisma from "../src/lib/prisma";

const ALL_PROVIDERS = ["microsoft", "google", "local"];

async function main() {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      portalEnabled: true,
      portalAuthProviders: true,
      portalDefaultRole: true,
    },
  });
  console.log(`Organisations : ${orgs.length}`);

  let touched = 0;
  for (const org of orgs) {
    const patch: Record<string, unknown> = {};

    if (!org.portalEnabled) {
      patch.portalEnabled = true;
    }

    const existing = new Set(org.portalAuthProviders ?? []);
    const missing = ALL_PROVIDERS.filter((p) => !existing.has(p));
    if (missing.length > 0) {
      patch.portalAuthProviders = Array.from(new Set([...existing, ...ALL_PROVIDERS]));
    }

    if (!org.portalDefaultRole) {
      patch.portalDefaultRole = "STANDARD";
    }

    if (Object.keys(patch).length === 0) continue;

    await prisma.organization.update({
      where: { id: org.id },
      data: patch as never,
    });
    touched++;
    console.log(`  ✓ ${org.name} — ${Object.keys(patch).join(", ")}`);
  }

  console.log(`\n✓ ${touched} organisations mises à jour.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
