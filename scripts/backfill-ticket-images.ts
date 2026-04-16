// Backfill : re-traite les tickets dont la descriptionHtml contient des
// `cid:` orphelins (causés par le bug "hasAttachments=false" sur les
// emails à images inline uniquement). Pour chaque ticket :
//   1. Lookup le message Graph via internetMessageId
//   2. Récupère les attachments image (avec contentBytes)
//   3. Upload vers MinIO + réécrit le HTML
//   4. Update Ticket.descriptionHtml
//
// Idempotent : retraiter un ticket déjà rewrité est inoffensif (les cid:
// auront déjà été remplacés, le second appel ne fait rien).
//
// Usage : npx tsx scripts/backfill-ticket-images.ts [limit]

import prisma from "@/lib/prisma";
import { rewriteInlineImages } from "@/lib/email-to-ticket/inline-images";
import { graphFetch } from "@/lib/email-to-ticket/service";

const CONFIG_KEY = "email-to-ticket";

async function getMailbox(): Promise<string | null> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  const cfg = row?.value as { mailbox?: string } | null;
  return cfg?.mailbox || null;
}

async function findGraphMessageId(
  mailbox: string,
  internetMessageId: string,
): Promise<string | null> {
  // Graph attend la valeur EXACTE telle qu'elle apparaît dans le RFC822
  // header — c'est-à-dire AVEC les `<>`. Notre champ Ticket.externalId
  // les contient déjà. On échappe juste les apostrophes pour OData.
  const escaped = internetMessageId.replace(/'/g, "''");
  const filter = `internetMessageId eq '${escaped}'`;
  try {
    const res = await graphFetch<{ value: { id: string }[] }>(
      `/users/${encodeURIComponent(mailbox)}/messages?$filter=${encodeURIComponent(filter)}&$select=id&$top=1`,
    );
    return res.value?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const limit = parseInt(process.argv[2] || "200", 10);
  const mailbox = await getMailbox();
  if (!mailbox) {
    console.error("✗ Pas de mailbox configurée (tenant_settings 'email-to-ticket')");
    process.exit(1);
  }
  console.log(`Mailbox : ${mailbox}`);

  const tickets = await prisma.ticket.findMany({
    where: {
      descriptionHtml: { contains: "cid:" },
      externalSource: "email",
      externalId: { not: null },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      externalId: true,
      descriptionHtml: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  console.log(`${tickets.length} tickets à traiter (limit=${limit}).\n`);
  let fixed = 0;
  let notFound = 0;
  let unchanged = 0;
  let errors = 0;

  for (const t of tickets) {
    try {
      const msgId = await findGraphMessageId(mailbox, t.externalId!);
      if (!msgId) {
        notFound++;
        console.log(`  TK-${1000 + t.number}: message Graph introuvable`);
        continue;
      }
      const before = t.descriptionHtml ?? "";
      const after = await rewriteInlineImages(before, mailbox, msgId, false, graphFetch);
      if (after === before) {
        unchanged++;
        console.log(`  TK-${1000 + t.number}: aucun changement`);
        continue;
      }
      await prisma.ticket.update({
        where: { id: t.id },
        data: { descriptionHtml: after },
      });
      fixed++;
      const cidsRemaining = (after.match(/cid:[^"'\s>]+/gi) ?? []).length;
      console.log(
        `  ✓ TK-${1000 + t.number}: rewrité (${cidsRemaining} cid: restants)`,
      );
    } catch (e) {
      errors++;
      console.error(`  ✗ TK-${1000 + t.number}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\nRésumé : ${fixed} fixés · ${unchanged} inchangés · ${notFound} email introuvable · ${errors} erreurs`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
