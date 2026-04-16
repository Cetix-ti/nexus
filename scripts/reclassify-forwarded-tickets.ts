// Reclassification rétroactive des tickets créés à partir d'emails
// transférés depuis la boîte partagée (billets@cetix.ca).
//
// Symptôme : avant le fix, n'importe quel email transféré par un agent
// à billets@cetix.ca se retrouvait isInternal=true parce que Nexus
// matchait le sender (billets@cetix.ca → domaine cetix.ca → org
// Cetix → isInternal). Résultat : des centaines de tickets clients
// atterrissaient dans /internal-tickets.
//
// Ce script :
//   1. Trouve tous les tickets isInternal=true, source=EMAIL,
//      dont le requester a l'email "billets@cetix.ca".
//   2. Essaie d'extraire l'expéditeur original depuis descriptionHtml
//      (patterns Outlook FR/EN "De :", "From:").
//   3a. Si on trouve et qu'on a une org correspondante (domaine match)
//       → réassigne le ticket à la bonne org + isInternal=false + crée
//       le Contact si besoin.
//   3b. Si on trouve un sender mais pas l'org → isInternal=false, le
//       ticket reste sur Cetix mais apparaît dans /tickets client pour
//       triage manuel.
//   3c. Si on ne trouve rien → ne touche pas (probablement un vrai
//       ticket interne envoyé par un agent qui utilisait billets@).
//
// Idempotent : les tickets déjà reclassifiés (isInternal=false) sont
// ignorés.
//
// Usage : npx tsx scripts/reclassify-forwarded-tickets.ts [--dry-run]

import prisma from "../src/lib/prisma";
import {
  parseForwardedSender,
  type ForwardedInfo,
} from "../src/lib/email-to-ticket/parse";

const SHARED_MAILBOX = "billets@cetix.ca";
const DRY_RUN = process.argv.includes("--dry-run");

function extractFromBody(subject: string, html: string): ForwardedInfo {
  return parseForwardedSender(subject, html, {
    email: SHARED_MAILBOX,
    name: "Billets",
  }, { forceBodyScan: true });
}

async function resolveOrgByEmail(email: string): Promise<{ id: string; name: string } | null> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  // On exclut les matches sur Cetix (le but du script est justement de
  // SORTIR les tickets de Cetix).
  const org = await prisma.organization.findFirst({
    where: {
      isInternal: false,
      OR: [{ domain }, { domains: { has: domain } }],
    },
    select: { id: true, name: true },
  });
  return org;
}

async function ensureContact(
  email: string,
  name: string,
  orgId: string,
): Promise<string> {
  const existing = await prisma.contact.findFirst({
    where: { email: email.toLowerCase(), organizationId: orgId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const [first, ...rest] = (name || email.split("@")[0]).split(" ");
  const created = await prisma.contact.create({
    data: {
      email: email.toLowerCase(),
      firstName: first || email.split("@")[0],
      lastName: rest.join(" "),
      organizationId: orgId,
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const cetix = await prisma.organization.findFirst({
    where: { isInternal: true },
    select: { id: true },
  });
  if (!cetix) {
    console.error("Aucune org interne.");
    return;
  }

  // Candidats : TOUS les tickets isInternal=true + source=EMAIL. On
  // scanne la description pour détecter un bloc "De : non-cetix" →
  // signale un forward. Les alertes monitoring (pas de requester ou
  // source=API) ne passent pas le filtre source=EMAIL et restent
  // intactes.
  const candidates = await prisma.ticket.findMany({
    where: {
      isInternal: true,
      source: "EMAIL",
    },
    select: {
      id: true,
      number: true,
      subject: true,
      descriptionHtml: true,
      description: true,
    },
  });
  console.log(`Candidats : ${candidates.length} tickets${DRY_RUN ? " (DRY RUN)" : ""}`);

  let reassigned = 0;
  let flagged = 0;
  let untouched = 0;

  for (const t of candidates) {
    const html = t.descriptionHtml || t.description || "";
    const info = extractFromBody(t.subject, html);
    if (!info.originalSenderEmail) {
      untouched++;
      continue;
    }
    const orig = info.originalSenderEmail;
    // Si le vrai sender reste @cetix.ca, c'est probablement un vrai
    // email interne (agent à agent) — on laisse tel quel.
    if (orig.toLowerCase().endsWith("@cetix.ca")) {
      untouched++;
      continue;
    }
    const origName = info.originalSenderName || orig.split("@")[0];
    const org = await resolveOrgByEmail(orig);

    if (org) {
      // Réassigne ticket + crée contact
      if (!DRY_RUN) {
        const contactId = await ensureContact(orig, origName, org.id);
        await prisma.ticket.update({
          where: { id: t.id },
          data: {
            organizationId: org.id,
            requesterId: contactId,
            isInternal: false,
          },
        });
      }
      reassigned++;
      console.log(
        `  #${t.number} → ${org.name} (${orig})  — ${t.subject.slice(0, 40)}`,
      );
    } else {
      // Pas d'org match : probablement un courriel vendor (Namecheap,
      // GoDaddy, etc.) transféré par un agent pour suivi — c'est légi-
      // timement interne (Cetix gère ses propres renouvellements).
      // On ne touche PAS à ces tickets pour éviter les faux positifs.
      untouched++;
    }
  }

  console.log(`\nRéassignés : ${reassigned}`);
  console.log(`Non touchés : ${untouched}`);
  void flagged; // plus utilisé après la refonte
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
